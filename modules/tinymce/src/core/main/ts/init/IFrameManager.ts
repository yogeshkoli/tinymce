import { Obj, Singleton } from '@ephox/katamari';
import { DomEvent, SugarElement } from '@ephox/sugar';

import DOMUtils from '../api/dom/DOMUtils';
import Editor from '../api/Editor';
import Env from '../api/Env';
import * as Options from '../api/Options';
import Delay from '../api/util/Delay';

export interface IFrameManager {
  readonly load: (content: string, loaded: (editor: Editor) => void) => void;
  readonly reset: () => void;
}

export const create = (editor: Editor, iframe: HTMLIFrameElement): IFrameManager => {
  const loadedBinder = Singleton.unbindable();
  const unloadBinder = Singleton.unbindable();

  const setupUnloadBinder = () => {
    unloadBinder.set(DomEvent.bind(SugarElement.fromDom(editor.getWin()), 'unload', () => {
      unloadBinder.clear();
      const selection = editor.selection;

      // Store current editor state
      const fullHtml = editor.getDoc().documentElement.innerHTML;
      const bookmark = selection.getBookmark(2, true);
      const wasFocused = editor.hasFocus();
      editor._pendingNativeEvents = editor.delegates ? Obj.keys(editor.delegates) : [];
      const winScroll = {
        x: editor.getWin().scrollX,
        y: editor.getWin().scrollY
      };

      // Destroy any state from the existing DOM
      selection.controlSelection.hideResizeRect();
      editor.unbindAllNativeEvents();
      // TODO: Determine if we can restore any events bound via editor.dom.bind()
      editor.dom.destroy();

      // Wait for the iframe to reload and then re-init the editor state
      setupLoadBinder(() => {
        const newWin = editor.getWin();
        const newDoc = editor.getDoc();

        newDoc.documentElement.innerHTML = fullHtml;
        editor.dom = DOMUtils(newDoc, {
          keep_values: true,
          // Note: Don't bind here, as the binding is handled via the `url_converter_scope`
          // eslint-disable-next-line @typescript-eslint/unbound-method
          url_converter: editor.convertURL,
          url_converter_scope: editor,
          update_styles: true,
          root_element: editor.inline ? editor.getBody() : null,
          collect: editor.inline,
          schema: editor.schema,
          contentCssCors: Options.shouldUseContentCssCors(editor),
          referrerPolicy: Options.getReferrerPolicy(editor),
          onSetAttrib: (e) => {
            editor.dispatch('SetAttrib', e);
          }
        });
        selection.win = newWin;
        selection.dom = editor.dom;
        editor.bindPendingEventDelegates();
        selection.moveToBookmark(bookmark);

        // Need to delay to get the window some time to render
        Delay.setEditorTimeout(editor, () => {
          newWin.scrollTo(winScroll.x, winScroll.y);
          if (wasFocused) {
            editor.focus();
          }

          editor.dispatch('ReloadEditor');
        }, 100);
      });
    }));
  };

  const setupLoadBinder = (loaded: () => void) => {
    loadedBinder.set(DomEvent.bind(SugarElement.fromDom(iframe), 'load', () => {
      loadedBinder.clear();

      // Reset the content document and window, since they may have changed
      editor.contentWindow = iframe.contentWindow as Window;
      editor.contentDocument = iframe.contentDocument as Document;

      setupUnloadBinder();
      loaded();
    }));
  };

  const init = (content: string, loaded: (editor: Editor) => void) => {
    setupLoadBinder(() => loaded(editor));

    editor.on('remove', reset);
    editor.editorManager.on('BeforeUnload', reset);

    // TINY-8916: Firefox has a bug in its srcdoc implementation that prevents cookies being sent so unfortunately we need
    // to fallback to legacy APIs to load the iframe content. See https://bugzilla.mozilla.org/show_bug.cgi?id=1741489
    if (Env.browser.isFirefox()) {
      const doc = editor.getDoc();
      doc.open();
      doc.write(content);
      doc.close();
    } else {
      iframe.srcdoc = content;
    }
  };

  const reset = () => {
    loadedBinder.clear();
    unloadBinder.clear();
    editor.off('remove', reset);
    editor.editorManager.off('BeforeUnload', reset);
  };

  return {
    load: init,
    reset
  };
};
