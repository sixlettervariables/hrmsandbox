# hrmsandbox
A sandbox for [Human Resource Machine](http://tomorrowcorporation.com/humanresourcemachine) programs.

## Installation
I'll need to put this up on npm first for this to work...

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

```sh
$ npm install
$ npm test
```

## Dependencies
- minimist

## Dev Dependencies
- peg.js

## License
MIT
