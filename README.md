# hrmsandbox
A sandbox for [Human Resource Machine](http://tomorrowcorporation.com/humanresourcemachine) programs. There is a similar project [hrm-cpu](https://github.com/nrkn/hrm-cpu) which works under ES6, and 
there are projects with [level data](https://github.com/atesgoral/hrm-level-data) and with [solutions](https://github.com/atesgoral/hrm-solutions).

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

> hrmsandbox@0.2.0 test /tmp/hrmsandbox
> tap test/*.js

test/syntax.js ........................................ 13/13
total ................................................. 13/13

  13 passing (342.102ms)

  ok
```

## Dependencies
- minimist

## Dev Dependencies
- peg.js

## License
MIT
