/*@
  req
*/
int positive(int value);

int first_positive(const int *values, int count) {
  /*@
    loop
  */
  for (int index = 0; index < count; ++index) {
    if (values[index] > 0) return index;
  }
  return -1;
}
