import { AlloyComponent, Boxes, Channels, Docking, VerticalDir } from '@ephox/alloy';
import { Cell, Fun, Optional, Singleton } from '@ephox/katamari';
import { Attribute, Css, Height, Scroll, SugarBody, SugarElement, SugarLocation, Traverse, Width } from '@ephox/sugar';

import DOMUtils from 'tinymce/core/api/dom/DOMUtils';
import Editor from 'tinymce/core/api/Editor';

import * as Options from '../../api/Options';
import { UiFactoryBackstage } from '../../backstage/Backstage';
import { RenderUiComponents } from '../../Render';
import OuterContainer from '../general/OuterContainer';
import * as EditorSize from '../sizing/EditorSize';
import * as Utils from '../sizing/Utils';

export interface InlineHeader {
  readonly isVisible: () => boolean;
  readonly isPositionedAtTop: () => boolean;
  readonly show: () => void;
  readonly hide: () => void;
  readonly update: (resetDocking?: boolean) => void;
  readonly updateMode: () => void;
  readonly repositionPopups: () => void;
}

const { ToolbarLocation, ToolbarMode } = Options;

export const InlineHeader = (
  editor: Editor,
  targetElm: SugarElement<HTMLElement>,
  uiComponents: RenderUiComponents,
  backstage: UiFactoryBackstage,
  floatContainer: Singleton.Value<AlloyComponent>
): InlineHeader => {
  const { uiMothership, outerContainer } = uiComponents;
  const DOM = DOMUtils.DOM;
  const useFixedToolbarContainer = Options.useFixedContainer(editor);
  const isSticky = Options.isStickyToolbar(editor);
  const editorMaxWidthOpt = Options.getMaxWidthOption(editor).or(EditorSize.getWidth(editor));
  const headerBackstage = backstage.shared.header;
  const isPositionedAtTop = headerBackstage.isPositionedAtTop;

  const toolbarMode = Options.getToolbarMode(editor);
  const isSplitToolbar = toolbarMode === ToolbarMode.sliding || toolbarMode === ToolbarMode.floating;

  const visible = Cell(false);

  const isVisible = () => visible.get() && !editor.removed;

  // Calculate the toolbar offset when using a split toolbar drawer
  const calcToolbarOffset = (toolbar: Optional<AlloyComponent>) => isSplitToolbar ?
    toolbar.fold(Fun.constant(0), (tbar) =>
      // If we have an overflow toolbar, we need to offset the positioning by the height of the overflow toolbar
      tbar.components().length > 1 ? Height.get(tbar.components()[1].element) : 0
    ) : 0;

  const calcMode = (container: AlloyComponent): 'top' | 'bottom' => {
    switch (Options.getToolbarLocation(editor)) {
      case ToolbarLocation.auto:
        const toolbar = OuterContainer.getToolbar(outerContainer);
        const offset = calcToolbarOffset(toolbar);
        const toolbarHeight = Height.get(container.element) - offset;
        const targetBounds = Boxes.box(targetElm);

        // Determine if the toolbar has room to render at the top/bottom of the document
        const roomAtTop = targetBounds.y > toolbarHeight;
        if (roomAtTop) {
          return 'top';
        } else {
          const doc = Traverse.documentElement(targetElm);
          const docHeight = Math.max(doc.dom.scrollHeight, Height.get(doc));
          const roomAtBottom = targetBounds.bottom < docHeight - toolbarHeight;

          // If there isn't ever room to add the toolbar above the target element, then place the toolbar at the bottom.
          // Likewise if there's no room at the bottom, then we should show at the top. If there's no room at the bottom
          // or top, then prefer the bottom except when it'll prevent accessing the content at the bottom.
          // Make sure to exclude scroll position, as we want to still show at the top if the user can scroll up to undock
          if (roomAtBottom) {
            return 'bottom';
          } else {
            const winBounds = Boxes.win();
            const isRoomAtBottomViewport = winBounds.bottom < targetBounds.bottom - toolbarHeight;
            return isRoomAtBottomViewport ? 'bottom' : 'top';
          }
        }
      case ToolbarLocation.bottom:
        return 'bottom';
      case ToolbarLocation.top:
      default:
        return 'top';
    }
  };

  const setupMode = (mode: 'top' | 'bottom') => {
    // Update the docking mode
    floatContainer.on((container) => {
      Docking.setModes(container, [ mode ]);
      headerBackstage.setDockingMode(mode);

      // Update the vertical menu direction
      const verticalDir = isPositionedAtTop() ? VerticalDir.AttributeValue.TopToBottom : VerticalDir.AttributeValue.BottomToTop;
      Attribute.set(container.element, VerticalDir.Attribute, verticalDir);
    });
  };

  const updateChromeWidth = () => {
    floatContainer.on((container) => {
      // Update the max width of the inline toolbar
      const maxWidth = editorMaxWidthOpt.getOrThunk(() => {
        // No max width, so use the body width, minus the left pos as the maximum
        const bodyMargin = Utils.parseToInt(Css.get(SugarBody.body(), 'margin-left')).getOr(0);
        return Width.get(SugarBody.body()) - SugarLocation.absolute(targetElm).left + bodyMargin;
      });
      Css.set(container.element, 'max-width', maxWidth + 'px');
    });
  };

  const updateChromePosition = (optToolbarWidth) => {
    floatContainer.on((container) => {
      const toolbar = OuterContainer.getToolbar(outerContainer);
      const offset = calcToolbarOffset(toolbar);

      // The float container/editor may not have been rendered yet, which will cause it to have a non integer based positions
      // so we need to round this to account for that.
      const targetBounds = Boxes.box(targetElm);
      const top = isPositionedAtTop() ?
        Math.max(targetBounds.y - Height.get(container.element) + offset, 0) :
        targetBounds.bottom;

      const baseProperties = {
        position: 'absolute',
        left: Math.round(targetBounds.x) + 'px',
        top: Math.round(top) + 'px'
      };

      const widthProperties = optToolbarWidth.filter(
        (_) => targetBounds.x > window.innerWidth
      ).map(
        (toolbarWidth: number) => {
          const scroll = Scroll.get();

          // This minimum width (150) is entirely arbitrarily determined. Change as 
          // required. The minimum width is designed to create an editor container of 
          // at least 150 pixels, even when near the edge of the screen. As the editor
          // container can wrap its elements (due to flex-wrap), the width of the 
          // container impacts also its height.
          //
          // Adding a minimum width works around two problems:
          //
          // a) The docking behaviour (e.g. lazyContext) does not handle the situation
          // of a very thin component near the edge of the screen very well, and actually
          // has no concept of horizontal scroll - it only checks y values.
          //
          // b) A very small toolbar is essentially unusable. On scrolling of X, we keep
          // updating the width of the toolbar so that it can grow to fit the available
          // space.
          //
          // As mentioned before, the 150px is entirely arbitrary. It was chosen because
          // with "reasonable" toolbar items, it stays rendered to a reasonable height. 
          // Note: this is entirely determined on the number of items in the menu and the
          // toolbar, because when they wrap, that's what causes the height. Also, having
          // multiple toolbars can also make it higher.
          const minimumToolbarWidth = 150;

          // The availableWidth is the amount of space to the right of the LEFT edge
          // of the container. We convert the left edge to screen coordinates by 
          // subtracting the scroll, so that we can subtract it from the window width
          const availableWidth = window.innerWidth - (targetBounds.x - scroll.left);

          // Despite how much availableWidth there is, never go smaller than minimumWidth
          // and never go larger than the original toolbarWidth. If we exceed the original
          // toolbarWidth, then the border / background etc. of the toolbar can extend 
          // well past the end of the items.
          const width = Math.max(
            minimumToolbarWidth,
            Math.min(
              toolbarWidth,
              availableWidth
            )
          );

          return {
            width: width + 'px'
          };
        }
      ).getOr({ });

      // Set top, left, and optional width all the same time.
      Css.setAll(outerContainer.element, {
        ...baseProperties,
        ...widthProperties
      });
    });
  };

  const repositionPopups = () => {
    uiMothership.broadcastOn([ Channels.repositionPopups() ], { });
  };

  const restoreAndGetCompleteOuterContainerWidth = (): Optional<number> => {
    // TINY-7827: Customers can stack the inline editors horizontally 
    // across the page inside an area that is much wider than the page. This means
    // that the editors further to the right are given "left" positions that are 
    // beyond the window width. When this happens, the flex-wrap: wrap property
    // wraps to the next line, even though there is quite a lot of available
    // scrollWidth space. One way around this is to set a "width"
    // style on the container as well.
    //
    // The problem is that we need to calculate the "unaffected" width, so to do
    // that, we need to remove a lot of restrictions / styles first, so that the 
    // width is just the natural container width. We also need to do this before 
    // we do any refreshToolbars call, so that the overflow section is working 
    // with the right dimensions.
    if (!useFixedToolbarContainer) {
      // Reset to the basics so that the width is the original width and is not
      // constrained by any locations.
      Css.set(outerContainer.element, 'position', 'absolute');
      Css.set(outerContainer.element, 'left', '0px');
      Css.remove(outerContainer.element, 'width');
      const w = Width.getOuter(outerContainer.element);
      return Optional.some(w);
    } else {
      return Optional.none();
    }
  };

  const updateChromeUi = (resetDocking: boolean = false) => {
    // Skip updating the ui if it's hidden
    if (!isVisible()) {
      return;
    }

    // Handles positioning, docking and SplitToolbar (more drawer) behaviour. Modes:
    // 1. Basic inline: does positioning and docking
    // 2. Inline + more drawer: does positioning, docking and SplitToolbar
    // 3. Inline + fixed_toolbar_container: does nothing
    // 4. Inline + fixed_toolbar_container + more drawer: does SplitToolbar

    // Update the max width, as the body width may have changed
    if (!useFixedToolbarContainer) {
      updateChromeWidth();
    }

    // TINY-7827: This width can be used for calculating the "width" when 
    // resolving issues with flex-wrapping being triggered at the window width, 
    // despite scroll space being available to the right
    const optToolbarWidth: Optional<number> = restoreAndGetCompleteOuterContainerWidth();
    
    // Refresh split toolbar. Before calling refresh, we need to make sure that 
    // we have the full width (through restoreAndGet.. above), otherwise too much 
    // will be put in the overflow drawer. We may need to calculate the width again after
    // this, also - just be aware of that.
    if (isSplitToolbar) {
      OuterContainer.refreshToolbar(outerContainer);
    }

    // Positioning
    if (!useFixedToolbarContainer) {
      // This will position the container in the right spot. Due to TINY-7827, 
      // it can set the "right" as well as the "left".
      updateChromePosition(optToolbarWidth);
    }

    // TINY-7827: Docking doesn't handle edge cases caused by very high editor 
    // containers for inline very well, so be aware of that. In most cases, it's 
    // bypassed by having a minimum width that is wide enough that the height never 
    // becomes a problem, but that could be dependent upon the configuration of the 
    // toolbar and menu bars, which will determine how much wrapping is still required.
    if (isSticky) {
      const action = resetDocking ? Docking.reset : Docking.refresh;
      floatContainer.on(action);
    }

    // Floating toolbar
    repositionPopups();
  };

  const updateMode = (updateUi: boolean = true) => {
    // Skip updating the mode if the toolbar is hidden, is
    // using a fixed container or has sticky toolbars disabled
    if (useFixedToolbarContainer || !isSticky || !isVisible()) {
      return;
    }

    floatContainer.on((container) => {
      const currentMode = headerBackstage.getDockingMode();
      const newMode = calcMode(container);
      if (newMode !== currentMode) {
        setupMode(newMode);
        if (updateUi) {
          updateChromeUi(true);
        }
      }
    });
  };

  const show = () => {
    visible.set(true);
    Css.set(outerContainer.element, 'display', 'flex');
    DOM.addClass(editor.getBody(), 'mce-edit-focus');
    Css.remove(uiMothership.element, 'display');
    updateMode(false);
    // This is the one that makes it move from wherever it is, to the smaller box
    // that it occupies. Previously, it was a rectangle anchored a body, probably ... but I'll verify. Nah, I think it's just in the DOM flow wherever it is, because it doesn't
    // have position: absolute yet.
    updateChromeUi();
  };

  const hide = () => {
    visible.set(false);
    if (uiComponents.outerContainer) {
      Css.set(outerContainer.element, 'display', 'none');
      DOM.removeClass(editor.getBody(), 'mce-edit-focus');
    }
    Css.set(uiMothership.element, 'display', 'none');
  };

  return {
    isVisible,
    isPositionedAtTop,
    show,
    hide,
    update: updateChromeUi,
    updateMode,
    repositionPopups
  };
};
