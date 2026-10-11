/*@
  requires count > 0;
  requires \valid_read(values + (0 .. count - 1));
  assigns \nothing;
  ensures \result >= 0;
*/
int maximum(const int *values, int count);

//@ assert maximum(values, count) >= 0;

// requires is an ordinary comment here.
const char *marker = "/*@ not an annotation */";

/*@
  loop invariant 0 <= index <= count;
  loop assigns index;
