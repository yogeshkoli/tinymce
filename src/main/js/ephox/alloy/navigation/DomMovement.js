define(
  'ephox.alloy.navigation.DomMovement',

  [
    'ephox.alloy.log.AlloyLogger',
    'ephox.sugar.api.Class',
    'ephox.sugar.api.Direction',
    'ephox.sugar.api.Focus',
    'ephox.sugar.api.SelectorFind'
  ],

  function (AlloyLogger, Class, Direction, Focus, SelectorFind) {
    // Looks up direction (considering LTR and RTL), finds the focused element,
    // and tries to move. If it succeeds, triggers focus and kills the event.
    var useH = function (movement) {
      return function (component, simulatedEvent, info) {
        var move = movement(component.element());
        return use(move, component, simulatedEvent, info);
      };
    };

    var west = function (moveLeft, moveRight) {
      var movement = Direction.onDirection(moveLeft, moveRight);
      return useH(movement);
    };

    var east = function (moveLeft, moveRight) {
      var movement = Direction.onDirection(moveRight, moveLeft);
      return useH(movement);
    };

    var useV = function (move) {
      return function (component, simulatedEvent, info) {
        return use(move, component, simulatedEvent, info);
      };
    };

    var getFocused = function (component, info) {
      console.log('getFocused', component.logSpec());
      return info.focusManager().fold(function () {
        console.log('no focus manager');
        return Focus.search(component.element());
      }, function (manager) {
        console.log('focus manager');
        var r = manager.get(component);
        console.log('r', r.getOr('none'));
        return r;
      });
    };

    var use = function (move, component, simulatedEvent, info) {
      var outcome = getFocused(component, info).bind(function (focused) {
        return move(component.element(), focused, info);
      });

      return outcome.map(function (newFocus) {
        info.focusManager().fold(function () {
          component.getSystem().triggerFocus(newFocus, component.element());  
        }, function (manager) {
          manager.set(component, newFocus);
        });
        return true;
      });
    };

    return {
      east: east,
      west: west,
      north: useV,
      south: useV,
      move: useV
    };
  }
);