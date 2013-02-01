# sawtooth
data access pattern for tiered-locality data access

## about

When you go to access some data in your application, where does it come from? It could be in memory, but maybe you also have an on-disk cache, and you might have a remoe location, say a REST api. Now what you've got is a problem of [spatial locality](http://en.wikipedia.org/wiki/Locality_of_reference), and it might be a good idea to separate the concern of tracking down where the data is away from the rest of your application.

In the above example, you would have 3 tiers of data access, sorted by latency:

a) in memory
b) on disk
c) remote service

Sawtooth is a caching data access pattern for `get`ing data identified by a key from each tier in turn, stopping at the first source which has the information availble. Then, on the way back up the tiers, it will call `set` and `get` successively, in a sawtooth pattern, for example:

     | ^
     v |
    a.get <------ a.set
     |           7|
     |          /
     |         /
     |        /
     |       /
     v      /
    b.get <------ b.set
     |           7|
     |          /
     |         /
     |        /
     |       /
     v      /
    c.get  /

Sawtooth lets you represent this logic in a matrix:

    sawtooth([
      [a.get, a.set],
      [b.get, b.set],
      [c.get]
    ])

which returns a function roughly equivalent to the following call order:

  or the following call order
  a.get(x)
  b.get(x)
  c.get(x)
  => yC
  b.set(x, yC)
  b.get(x)
  => yB
  a.set(x, yB)
  a.get(x)
  => yA

Note that `sawtooth` supports mixing sync and async getters and setters through [Promises/A+ compliant promises](https://github.com/promises-aplus/promises-spec).

You can also pipeline mapping functions to transform values before a setter

  eg:
    sawtooth([
      [a.get, a.set],
      [null, bToa]
      [b.get]
    ])

  represents:

     | ^
     v |
    a.get <---- a.set
     |            ^
     |            |
     |          bToa
     |           7|
     |          /
     v         /
    b.get  ---/

## installation

    $ npm install sawtooth

## usage

`sawtooth` takes a matrix of functions and returns a function with the configured pipeline. Each row represents another tier.

    sawtooth (matrix) => pipeline

where

    pipeline(key) => Promise<value>

The first type of tier is a getter/setter pair. The last tier should be a single getter.

    [
      [a.get, a.set],
      [b.get, b.set],
      [c.get]
    ]

Tiers can also support optional string labels, used for logging and debugging:

    [
      [a.get, a.set, 'source A'],
      [b.get, b.set, 'source B'],
      [c.get, 'source C']
    ]

Getters are functions with the interface

    function (key) => value
or
    function (key) => Promise<value>

Setters are functions with the interface

    function (key, value) => void

Currently `sawtooth` only supports a read-only access pattern.

The other type of tier is a scalar mapping function to transform the value. These may only be used in column 2, and are called in serial on the way back up from bottom to top with the value returned by the previous getter. This can be useful, for example, for deserializing JSON into an object, or calling a constructor. These tiers can also take a label.

    [
      [a.get, a.set, 'source A'],
      [null, deserializeFoo, 'construct a new Foo'],
      [c.get, 'source C']
    ]

Mappers are functions with the interface

    function (value, key) => valuePrime
or
    function (value, key) => Promise<valuePrime>

The key is passed as the second argument so that plain scalar functions (eg (x) => y ) will work fine if the key is not necessary.

## logging and debugging

`sawtooth` returns a pipeline, which is also an EventEmitter which emits `log` events.

    event `log`, values [level, message, stepLabelOrNumber, key, val]


## running the tests

    $ npm test

## contributors

jden <jason@denizac.org>

please open an issue or pull request!

## license

MIT, (c) 2013 Agile Diagnosis, Inc. See LICENSE.md
