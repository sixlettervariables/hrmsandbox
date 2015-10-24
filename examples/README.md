# HRM Sandbox Examples
This folder contains examples you can run through the HRM Sandbox program.

## HRM Sandbox Program
An HRM Sandbox program consists of a mix of labels and instructions, one per
line, with or without comments.

```
  // this is a Single Line comment
  inbox // this is a comment with an instruction
  /* This is
  a
  Multi
              Line
  Comment */
```

## HRM Sandbox Instruction Set
| Instruction    | Description                                                          |
|----------------|----------------------------------------------------------------------|
| `inbox`        | Takes the value from the top of the inbox and places it in your hand |
| `outbox`       | Takes the value from your hand and places it on the top of the inbox |
| `copyto $v`    | Copies the value in your hand into `$v`                              |
| `copyfrom $v`  | Copies the value from `$v` into your hand                            |
| `add $v`       | Adds the value in your hand to the value in `$v`                     |
| `sub $v`       | Subtracts from the value in your hand the value in `$v`              |
| `bump+ $v`     | Increments the value in $v by one (1), saving it into `$v` and your hand |
| `bump- $v`     | Decrements the value in $v by one (1), saving it into `$v` and your hand |
| `jump :label`  | Jumps to `:label`                                                    |
| `jumpz :label` | Jumps to `:label` if the value in your hand is zero (0)              |
| `jumpn :label` | Jumps to `:label` if the value in your hand is negative              |

## Examples
The `examples` folder contains some examples of HRM Sandbox programs.

### `min-of-3.hrm`
Orders inputs (grouped in 3's) from smallest to largest.

```sh
$ hrmsandbox --file=min-of-3.hrm -- 3 -5 1 9 -5 -3
```
