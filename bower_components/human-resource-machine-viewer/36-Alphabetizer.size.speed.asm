-- HUMAN RESOURCE MACHINE PROGRAM --
-- Solution to floor 36, Alphabetizer
-- Created by Alan De Smet

    COMMENT  4
a:
b:
    COPYFROM 23
    COPYTO   22
c:
    INBOX   
    COPYTO   [22]
    JUMPZ    d
    BUMPUP   22
    JUMP     c
d:
    COMMENT  0
    COPYFROM 23
    COPYTO   22
e:
    COPYFROM [22]
    JUMPZ    j
    INBOX   
    COPYTO   21
    JUMPZ    a
    SUB      [22]
    JUMPZ    f
    JUMPN    l
    JUMP     g
f:
    COPYFROM 21
    OUTBOX  
    BUMPUP   22
    JUMP     e
g:
    COMMENT  1
h:
    COPYFROM [22]
    JUMPZ    i
    OUTBOX  
    BUMPUP   22
    JUMP     h
i:
j:
k:
    INBOX   
    JUMP     k
    COMMENT  3
l:
    COMMENT  2
    COPYFROM 21
    OUTBOX  
m:
    INBOX   
    JUMPZ    b
    OUTBOX  
    JUMP     m


DEFINE COMMENT 0
eJwLZ2BgkBASrRUVjmnqF3Vf2CkesqpR6trq3TKCK0rkm+a+VQyoXK3EMOeFsuCKx6ohq2ZrTF4ZqOO+
0M1gcjVQK8N5F9HaCEfR2gQ7yYZVVmt631junJZhzbHoka3oaknH2eu73GQ3/vYWXPHTx33hdl+jSeW+
MU17vC9Vtbt7l/W7eJeBzLgXdq58Trhg1e1wyYaY8MkrZ0YsaReN4in3j2nKZ0g6mGeVcrQQpM6ypq2o
toqlsKOsrYi/pL8iuOhWQ3CRVs+E4j8z3MpvrWOsnL/JrPbeRr0G0dXaje4LtRsTWnMbJBs21V2qOlrO
AjZDuYXBYVGLfe6TZtHaJ80ci0BifYsDvNmXeXv8XXnSbekmDrepOy75sO1bEvnz0ME8syPnyr8cYZlf
cVhy3Z6DSltO7dHbG73t8wG5rZ8PJGzZsE99U+LmtE0Byxdt5l0atqNr8Zndgiu2H36+fdNRrV0Mo2AU
DAEAAF0amCQ;

DEFINE COMMENT 1
eJxjZWBgOF520OF42fywo+XWWRlNEbcZRsEoGAUjBgAAlX8IdA;

DEFINE COMMENT 2
eJyTYmBgWJ0ZEaiSc8lHsLjPa2ttn5dCa0zItY7M2HPd39Pb+2Y3svUXTuzqnbySr2fJ1iudG/bJtVUd
XdXIcIq/pOn03Lyqo0+zN+xTz1bbrpJzb+PcvJgNhypiNpTWJm5OaH2/92JX3QmnCYLXGEbBKBgFgxIA
ALPqM4E;

DEFINE COMMENT 3
eJxjYBgFo2AUjGQAAAQEAAE;

DEFINE COMMENT 4
eJwzZmBg2C2Ta2Qqv0JPSlNN11Nfz5jJyNqmzrjL/b9RiN889czYs7qlaQ1GRwurTS5V2Zgotv030upp
M3jf3yM2eSVQO8O0SEWt8y6y6v0uKTq9roWmrh5HnQ968nhu9JcNTQ/ekrokRLRWIzihdX3A6x5nz70z
Q53aFoD1Lfhjc3h5pfWRfZXWLPsZHLI3RNQbrsvsLl67ZTJInuNqpXX8mb22S04ddJhzdk289LkNSZcv
GKUIXPqe7n+Jo+Tyhel10ufUOpec2jCh9EjVdIZRMApGAckAACnAUx0;

DEFINE LABEL 21
eJxzZGBgyLY6V/7J/GQJk9HJEh69/opbGrMbl6k879RXLJ1SqFA3q1Dh3NJ1iqKr01VkN4Zpae0qMzM6
IOZUuB+olcEgQFSxyN/Z6bOf3t7PfqnbVENEax+HCFbdDvcu64nlKGlMPFlSmXKpakN6Zndexo+pH9JX
7ADpU265Vru8aXJ1QX1IjV1VQuvxMusZHWW8S93KI9b+rFbbrt24ZvfDlvd7hbve7/XtWbPbo+/xlpb+
6Wv2TLpWu3Ny4cSdk3mX/p70eMu+iZ8PgMyb0ybb/G/ivWYQ+8Z82WbxBYIrbs9T2z57ntKW8AU/pl5e
+LjtwqLpdZ1LOUqal7sXV64G+nnt5GrDddPrGEbBKBjBAAAzKXor;

DEFINE LABEL 22
eJxTZ2Bg2GE6vW6rWcTarWa5r4BcBjMzjpL3Fgx5Nx2qMjndqzKdPRny/nmdLPnnldrB6LVhArPnlsls
Hj+mSjscnPPcumkuSI9UxHvjOeH29nPCjVJmRniXTYl63tkT+77/WLzRpMbEzO6/SbcaQOqM/QO8TdL6
vEDswGKjFP4SrR7PssLko+WKEQ2VEYG1Vdf8VzVe85foiAlhGAWjYBTQHAAAToc78w;

DEFINE LABEL 23
eJyTYWBg6C59Hj2jQDHifu7z6FeZZukf0g/mbU7jKf+aOr3ua6pWj0ma0ST9DJb5cXmZO/1K/hxzK7c/
ubX2z7EnzXp777TJbgzt1OsX6wypedhilr686X2ic8WKGKCxDDfbGRwUWkP8zGrvNfOXiK5+kXXpGsMo
GAWjYFABAKoAM8A;


