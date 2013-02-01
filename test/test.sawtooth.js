var chai = require('chai')
chai.should();
var sinon = require('sinon')
chai.use(require('sinon-chai'))
chai.use(require('chai-interface'))

describe('services/sawtooth', function () {

  var sawtooth = require('../index')
  var when = require('when');

  it('returns a function', function () {
    var pipeline = sawtooth();
    pipeline.should.be.a('function')
    pipeline.should.have.interface({
      on: Function,
      addListener: Function,
      removeListener: Function,
      emit: Function
    })
  })

  describe('pipeline', function () {

    it('takes a key and returns a promise', function () {
      var pipeline = sawtooth();
      pipeline('x').then.should.be.a('function')
    })
    it('will always eventually be rejected if the pipeline is empty', function (done) {
      var pipeline = sawtooth();
      pipeline('x').then(function () {
        done(new Error('should not be resolved'))
      }, function () {
        done();
      })
    })
  });

  describe('input', function () {

    it('takes a series of getters and setters', function () {
      var a, b, c
      a = b = c = {get: function() {}, set: function (){}}

      var pipeline = sawtooth([
                      [a.get, a.set],
                      [b.get, b.set],
                      [c.get]
                    ])

    })

    it('each pair can have a third argument (second for the last), which is a label (used for debugging)', function (done) {

      var a, b, c
      a = b = {get: function() {}, set: function (){}}
      c = {get: function () { return true; }}
      var log = sinon.spy()
      var pipeline = sawtooth([
                      [a.get, a.set, 'Step A'],
                      [b.get, b.set, 'Step B'],
                      [c.get, 'Step C']
                    ])

      pipeline.on('log', log)

      pipeline('x').then(function () {
        log.calledOnce.should.equal(true)
        var step = log.firstCall.args[2]
        step.should.equal('Step C')
      }).then(done, done)

    })

  })

  function makeGetSetter(getResult, setResult) {
    return {
      get: sinon.stub().returns(getResult),
      set: sinon.stub().returns(setResult)
    }
  }

  describe('fallback pattern', function () {
    it('first checks the first getter', function (done) {
      var a = makeGetSetter('y')
      var b = makeGetSetter()
      var c = makeGetSetter()

      var pipeline = sawtooth([
                      [a.get, a.set],
                      [b.get, b.set],
                      [c.get]
                    ])

      var prom = pipeline('x').then(function (val) {
        val.should.equal('y');
        a.get.callCount.should.equal(1);
        a.get.firstCall.args[0].should.equal('x')
        b.get.callCount.should.equal(0)
        c.get.callCount.should.equal(0)
      }).then(done, done)

    })

    it('then checks the second getter', function (done) {
      var aGetCallCount = 0;
      var a = {
        get: function (key) {
          key.should.equal('x');
          aGetCallCount++;
          if (aGetCallCount === 1) { return; }
          return 'y';
        },
        set: sinon.spy()
      }
      var b = makeGetSetter('y')
      var c = makeGetSetter()

      var pipeline = sawtooth([
                      [a.get, a.set],
                      [b.get, b.set],
                      [c.get]
                    ])

      pipeline('x').then(function (val) {
        val.should.equal('y');
        aGetCallCount.should.equal(2);
        a.set.callCount.should.equal(1);
        a.set.firstCall.args.should.deep.equal(['x','y']);
        b.get.callCount.should.equal(1);
        b.get.firstCall.args[0].should.equal('x')
        c.get.callCount.should.equal(0)
      }).then(done, done)

    })

    it('then checks the last getter', function (done) {

      var a = {
        getCallCount: 0,
        get: function (key) {
          key.should.equal('x');
          a.getCallCount++;
          if (a.getCallCount === 1) { return; }
          return 'y';
        },
        set: sinon.spy()
      }
      var b = {
        getCallCount: 0,
        get: function (key) {
          key.should.equal('x');
          b.getCallCount++;
          if (b.getCallCount === 1) { return; }
          return 'y';
        },
        set: sinon.spy()
      }

      var c = makeGetSetter('y')

      var pipeline = sawtooth([
                      [a.get, a.set],
                      [b.get, b.set],
                      [c.get]
                    ])

      pipeline('x').then(function (val) {
        val.should.equal('y');
        a.getCallCount.should.equal(2);
        b.getCallCount.should.equal(2);
        c.get.callCount.should.equal(1);
        c.get.firstCall.args[0].should.equal('x')
      }).then(done, done)

    })

    it('then skips null getters (for pipelined mapping functions) and applies the setter on the way up', function (done) {
      var aGetCallCount = 0;
      var a = {
        get: function (key) {
          key.should.equal('x');
          aGetCallCount++;
          if (aGetCallCount === 1) { return; }
          return 'Y';
        },
        set: sinon.spy()
      }
      var upperCase = function (val) {
        return val.toUpperCase();
      }
      var b = makeGetSetter('y');

      var pipeline = sawtooth([
                      [a.get, a.set],
                      [null, upperCase],
                      [b.get]
                    ])

      pipeline('x').then(function (val) {
        val.should.equal('Y');
        aGetCallCount.should.equal(2);
        a.set.callCount.should.equal(1);
        a.set.firstCall.args.should.deep.equal(['x','Y']);
        b.get.callCount.should.equal(1);
        b.get.firstCall.args.should.deep.equal(['x']);
      }).then(done, done)

    })

    it('calls the last getter, then each prior setter with the value of the getter', function (done) {
      /* e.g:
        a.get x
        => fail
        b.get x
        => fail
        c.get x
        => y
        b.set x y
        b.get x
        => yB
        a.set x yB
        a.get x
        => yA
      */
      var a = {
        getCallCount: 0,
        get: function (key) {
          key.should.equal('x');
          a.getCallCount++;
          if (a.getCallCount === 1) { return; }
          return 'yA';
        },
        set: sinon.spy()
      }
      var b = {
        getCallCount: 0,
        get: function (key) {
          key.should.equal('x');
          b.getCallCount++;
          if (b.getCallCount === 1) { return; }
          return 'yB';
        },
        set: sinon.spy()
      }

      var c = makeGetSetter('yC')

      var pipeline = sawtooth([
                      [a.get, a.set],
                      [b.get, b.set],
                      [c.get]
                    ])

      pipeline('x').then(function (val) {
        val.should.equal('yA');
        c.get.callCount.should.equal(1);
        c.get.firstCall.args[0].should.equal('x')
        b.set.should.have.been.calledOnce;
        b.set.should.have.been.calledWithExactly('x', 'yC');
        a.set.should.have.been.calledOnce;
        a.set.should.have.been.calledWithExactly('x', 'yB')
      }).then(done, done)

    })

    it('emits a log info event when a value is returned, indicating where it was returned from', function (done) {
      // log(level, message, step, key, value)
      var a = makeGetSetter()
      var b = makeGetSetter()
      var c = makeGetSetter('yC')

      var pipeline = sawtooth([
                      [a.get, a.set],
                      [b.get, b.set],
                      [c.get]
                    ])

      var log = sinon.spy();
      pipeline.on('log', log)

      pipeline('x').then(function (val) {

        log.should.have.been.calledOnce;
        var level = log.firstCall.args[0];
        var message = log.firstCall.args[1];
        var step = log.firstCall.args[2];
        var key = log.firstCall.args[3];
        var value = log.firstCall.args[4];

        level.should.equal('info');
        message.should.be.a('string');
        step.should.equal(2); // the third step, starting from 0
        key.should.equal('x')
        value.should.equal('yC');

      }).then(done, done)

    })
  })

  describe('unwind', function () {
    it('calls set-get walking backward from a series', function (done) {
      var a = makeGetSetter('a')
      var b = makeGetSetter('b')

      var pipeline = [
        [a.get, a.set],
        [b.get, b.set]
      ]

      sawtooth._unwind(pipeline, 'x', 'c').then(function (val) {
        b.set.should.have.been.calledOnce
        b.set.should.have.been.calledWithExactly('x','c');
        b.get.should.have.been.calledOnce
        b.get.should.have.been.calledWithExactly('x');
        a.set.should.have.been.calledOnce
        a.set.should.have.been.called.calledWithExactly('x','b');
        a.get.should.have.been.calledOnce
        a.get.should.have.been.calledWithExactly('x')
        val.should.equal('a');
      }).then(done, done)
    })

    it('returns the first value if series is emtpy', function (done) {
      sawtooth._unwind([], 'x', 'val').then(function (val) {
        val.should.equal('val')
      }).then(done, done)
    })

    it('skips null getters and passes the last set value straight through to the next setter', function (done) {
      var a = makeGetSetter('a')
      var upperCase = function (val) { return val.toUpperCase(); }

      var pipeline = [
                      [a.get, a.set],
                      [null, upperCase]
                    ]

      sawtooth._unwind(pipeline, 'x', 'hey')
      .then(function (val) {
        a.set.should.have.been.calledOnce
        a.set.should.have.been.called.calledWithExactly('x','HEY');
        a.get.should.have.been.calledOnce
        a.get.should.have.been.calledWithExactly('x')
      }).then(done, done)
    })

    it('calls scalar functions with `value` arg', function (done) {
      var a = makeGetSetter('a')
      var upperCase = sinon.stub().returns('10')

      var pipeline = [
                      [a.get, a.set],
                      [null, upperCase]
                    ]

      sawtooth._unwind(pipeline, 'x', 'hey')
      .then(function (val) {
        upperCase.should.have.been.calledWithExactly('hey', 'x')

        a.set.should.have.been.calledOnce
        a.set.should.have.been.called.calledWithExactly('x','10');
        a.get.should.have.been.calledOnce
        a.get.should.have.been.calledWithExactly('x')
      }).then(done, done)
    })

  })

})