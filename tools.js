module.exports = {
  foo: function () {
    // whatever - will be available by other coder using "require"
  },
  bar: function () {
    // whatever - will be available by other coder using "require"
  }
};

var zemba = function () {
	//whatever - will NOT be available by other coder using "require"
}