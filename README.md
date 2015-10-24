# hrmsandbox
A sandbox for [Human Resource Machine](http://tomorrowcorporation.com/humanresourcemachine) programs.

## Web Demo
[Try a live demo of the HRM Sandbox.](https://s3.amazonaws.com/christopherwatford-com/hrm/hrmfiddle.html)

## Installation
Download node at [nodejs.org](http://nodejs.org) and install it, if you haven't already.
```sh
$ npm install hrmsandbox
```

## Usage

```sh
$ hrmsandbox --file=min-of-3.hrm -- 3 5 -1 2 -9 -9 13 -20 0
INBOX:
[ 3, 5, -1, 2, -9, -9, 13, -20, 0 ]
VARIABLES:
{ a: -20, b: 0, c: 13, temp: 0 }
INBOX:
[]
OUTBOX:
[ 13, 0, -20, 2, -9, -9, 5, 3, -1 ]
```

## Tests
Tests use `tape` and require `tap`:
```sh
$ npm install
$ npm test

> hrmsandbox@0.1.0 test /tmp/hrmsandbox
> tap test/*.js

test/syntax.js ........................................ 2/2
total ................................................. 2/2

  2 passing (163.716ms)

  ok
```

## Dependencies
- minimist

## Dev Dependencies
- peg.js

## License
MIT
