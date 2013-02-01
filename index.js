var prometido = require('prometido');
var EventEmitter = require('events').EventEmitter;

function sawtooth(series) {
  var pipeline = function (key){
    if (!isArray(series) || !series.length) {
      return prometido.asRejectedPromise()
    }

    var sawtoothPromise = new prometido.Deferred()
    var stepNumber = -1;
    prometido.reduce(series, function (prev, step, next) {
      stepNumber++;
      var get = step[0];
      if (get === null) {
        //skip this step's getter (it's a mapper function setter)
          prev.push(step);
          return next.resolve(prev)
      }
      prometido.pCall(get, key)
      .then(function (val) {
        if (typeof val === 'undefined') {
          prev.push(step);
          return next.resolve(prev)
        }
        // first getter which returns a value, we unwind the series
        // and return

        var stepLabel = step[2] || step[1];
        if (typeof stepLabel !== 'string') {
          stepLabel = stepNumber
        }

        pipeline.emit('log','info','getting value at step ', stepLabel, key, val)
        var unwound = unwind(prev, key, val)
        sawtoothPromise.resolve(unwound);
      }, function (err) {
        pipeline.emit('log', 'error', err, stepLabel, key, val);
        sawtoothPromise.reject(err);
      });

    }, [])

    return sawtoothPromise.promise();

  }

  for (var prop in EventEmitter.prototype) {
    var fn = EventEmitter.prototype[prop];
    if (typeof fn !== 'function') return;
    pipeline[prop] = bind(fn, pipeline)
  }
  return pipeline;
}

function unwind(series, key, value) {
  if (!('length' in series && series.length)) {
    return prometido.asPromise(value);
  }

  return prometido.reduceRight(series, function (value, step) {
    var get = step[0];
    var set = step[1];

    if(get === null) {
      // this is a mapper step (scalar function)
      return prometido.pCall(set, value, key)
    }

    // this is a setter step
    return prometido.pCall(set, key, value)
      .then(function () {
        return prometido.pCall(get, key)
      })

  }, /* begin with bottom-most value */ value)
}

/* ES3 compat */
function bind(fn, context) {
  return function () {
    return fn.apply(context, arguments)
  }
}

function isArray(arr) {
  return Object.prototype.toString.call(arr) === '[object Array]'
}

/* promise logic */


module.exports = sawtooth;
module.exports._unwind = unwind;