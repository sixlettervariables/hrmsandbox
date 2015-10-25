# HRM Sandbox Examples
This folder contains examples you can run through the HRM Sandbox program.

## HRM Sandbox Program
An HRM Sandbox program consists of a mix of labels and instructions, one per
line, with or without comments.

### Classic Syntax
The classic HRM Syntax is supported and should be preferred when sharing
solutions.
```
-- HUMAN RESOURCE MACHINE PROGRAM --
-- this is a Single Line comment
a:
  inbox -- this is a comment with an instruction
  copyto 9
  jumpz c
b:
  copyto 3
  copyfrom 9
  add 3
  outbox
  jump a
c:
  outbox
  jump a
```

### Extended Syntax
Extended Syntax for the HRM Assembler is supported as well, allowing C style
comments and named variables.
```
-- HUMAN RESOURCE MACHINE PROGRAM --
-- this is a Single Line comment
start:
  inbox // this is a comment with an instruction
  copyto $temp
  jumpz noadd

/* this label is used only for
 * example purposes
 */
next:
  copyto $adder
  copyfrom $temp
  add $adder
  outbox
  jump start

noadd:
  outbox
  jump start
```

## HRM Sandbox Instruction Set
| Instruction    | Description                                                          |
|----------------|----------------------------------------------------------------------|
| `inbox`        | Takes the value from the top of the inbox and places it in your hand |
| `outbox`       | Takes the value from your hand and places it on the top of the inbox |
| `copyto 0`     | Copies the value in your hand into `0`                              |
| `copyfrom 0`   | Copies the value from `0` into your hand                            |
| `add 5`        | Adds the value in your hand to the value in `5`                     |
| `sub 9`        | Subtracts from the value in your hand the value in `9`              |
| `bumpup 0`     | Increments the value in `0` by one (1), saving it into `0` and your hand |
| `bumpdn 3`     | Decrements the value in `3` by one (1), saving it into `3` and your hand |
| `jump label`   | Jumps to `label`                                                    |
| `jumpz label`  | Jumps to `label` if the value in your hand is zero (0)              |
| `jumpn label`  | Jumps to `label` if the value in your hand is negative              |

## Examples
The `examples` folder contains some examples of HRM Sandbox programs.

### `min-of-3.hrm`
Orders inputs (grouped in 3's) from smallest to largest.

```sh
$ hrmsandbox --file=min-of-3.hrm -- 3 -5 1 9 -5 -3
```
