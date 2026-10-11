/*@
  requires size > 0;
  ensures \result != \null;
*/
const int *first(const int *values, int size);

//@ assert \valid_read(values);

const char *line_marker = "//@ not an annotation";
