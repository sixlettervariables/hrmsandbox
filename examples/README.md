# HRM Sandbox Examples
This folder contains examples you can run through the HRM Sandbox program.

## HRM Sandbox Program
An HRM Sandbox program consists of a mix of labels and instructions, one per
line, with or without comments.

### Classic Syntax
The classic HRM Syntax is supported and consists of case-sensitive instructions
and labels.
```
-- HUMAN RESOURCE MACHINE PROGRAM --
-- this is a Single Line comment
a:
  INBOX -- this is a comment with an instruction
  COPYTO 9
  JUMPZ c
b:
  COPYTO 3
  COPYFROM 9
  ADD 3
  OUTBOX
  JUMP a
c:
  OUTBOX
  JUMP a
```

## HRM Sandbox Instruction Set
| Instruction    | Description                                                          |
|----------------|----------------------------------------------------------------------|
| `INBOX`        | Takes the value from the top of the inbox and places it in your hand |
| `OUTBOX`       | Takes the value from your hand and places it on the top of the inbox |
| `COPYTO 0`     | Copies the value in your hand into `0`                              |
| `COPYFROM 0`   | Copies the value from `0` into your hand                            |
| `ADD 5`        | Adds the value in your hand to the value in `5`                     |
| `SUB 9`        | Subtracts from the value in your hand the value in `9`              |
| `BUMPUP 0`     | Increments the value in `0` by one (1), saving it into `0` and your hand |
| `BUMPDN 3`     | Decrements the value in `3` by one (1), saving it into `3` and your hand |
| `JUMP label`   | Jumps to `label`                                                    |
| `JUMPZ label`  | Jumps to `label` if the value in your hand is zero (0)              |
| `JUMPN label`  | Jumps to `label` if the value in your hand is negative              |

## Examples
The `examples` folder contains some examples of HRM Sandbox programs.

### `min-of-3.hrm`
Orders inputs (grouped in 3's) from smallest to largest.

```sh
$ hrmsandbox --file=min-of-3.hrm -- 3 -5 1 9 -5 -3
```
