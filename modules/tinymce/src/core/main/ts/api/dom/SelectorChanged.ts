import { Arr, Obj, Optional } from '@ephox/katamari';

import Editor from '../Editor';

type SelectorChangedCallback = (active: boolean, args: { node: Node; selector: String; parents: Node[] }) => void;

interface SelectorChanged {
  selectorChangedWithUnbind: (selector: string, callback: SelectorChangedCallback) => { unbind: () => void };
}

const deleteFromCallbackMap = (callbackMap: Record<string, SelectorChangedCallback[]>, selector: string, callback: SelectorChangedCallback) => {
  if (Obj.has(callbackMap, selector)) {
    const newCallbacks = Arr.filter(callbackMap[selector], (cb) => cb !== callback);

    if (newCallbacks.length === 0) {
      delete callbackMap[selector];
    } else {
      callbackMap[selector] = newCallbacks;
    }
  }
};

export default (editor: Editor): SelectorChanged => {
  let selectorChangedData: Record<string, SelectorChangedCallback[]>;
  let currentSelectors: Record<string, SelectorChangedCallback[]>;

  const findMatchingNode = (selector: string, nodes: Node[]): Optional<Node> =>
    Arr.find(nodes, (node) => editor.dom.is(node, selector));

  const getParents = (elem: Element): Node[] =>
    editor.dom.getParents(elem, undefined, editor.dom.getRoot());

  const setup = (): void => {
    selectorChangedData = {};
    currentSelectors = {};

    editor.on('NodeChange', (e) => {
      const node = e.element;
      const parents = getParents(node);
      const matchedSelectors: Record<string, SelectorChangedCallback[]> = {};

      // Check for new matching selectors
      Obj.each(selectorChangedData, (callbacks, selector) => {
        findMatchingNode(selector, parents).each((node) => {
          if (!currentSelectors[selector]) {
            // Execute callbacks
            Arr.each(callbacks, (callback) => {
              callback(true, { node, selector, parents });
            });

            currentSelectors[selector] = callbacks;
          }

          matchedSelectors[selector] = callbacks;
        });
      });

      // Check if current selectors still match
      Obj.each(currentSelectors, (callbacks, selector) => {
        if (!matchedSelectors[selector]) {
          delete currentSelectors[selector];

          Arr.each(callbacks, (callback) => {
            callback(false, { node, selector, parents });
          });
        }
      });
    });
  };

  return {
    selectorChangedWithUnbind: (selector: string, callback: SelectorChangedCallback): { unbind: () => void } => {
      if (!selectorChangedData) {
        setup();
      }

      // Add selector listeners
      if (!selectorChangedData[selector]) {
        selectorChangedData[selector] = [];
      }

      selectorChangedData[selector].push(callback);

      // Setup the initial state if selected already
      findMatchingNode(selector, getParents(editor.selection.getStart())).each(() => {
        currentSelectors[selector] = selectorChangedData[selector];
      });

      return {
        unbind: () => {
          deleteFromCallbackMap(selectorChangedData, selector, callback);
          deleteFromCallbackMap(currentSelectors, selector, callback);
        }
      };
    }
  };
};
