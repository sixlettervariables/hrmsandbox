Comments in Human Resource Machine

The comments/labels in Human Resource Machine are Base64 encoded.  Inside that it's raw zlib compressed.  Inside that is a stream of little-endian 16-bit unsigned integers.  The uncompressed data will be at most 514 bytes long.

The first number is the number of elements that follow.  It will never exceed 255.  The second is always zero.  Beyond that are pairs of x and y coordinates.  Lines should be be drawn between the pairs.  Each coordinate ranges from 0 through 65535 (2^16-1), even though the aspect ratio of the comment is not square.  If x and y are both zero, that indicates a break; don't connect that point and the next point (if any) is a new start point.  0,0 is the upper left corner of the label, 65535,65535 is the lower right.

A label is roughly 3:1.  The strokes have a diameter of about 1/10th or 1/11th of the height.

When displayed, the label is zoomed in on the area with actual strokes.  The label will be made narrower to fit the strokes, but never shorter.

On 1920x1080 screenshot comments are about 235-237 by 77-78.  The exact size is unclear; due to scaling/sub-pixel positioning, the edges are fuzzy.  In that same screenshot a single dot is about 7-8 by 7-9, again with fuzzy edges.

