const authValidator = require('./authValidator');
const sessionValidator = require('./sessionValidator');
const passwordValidator = require('./passwordValidator');

module.exports = {
  ...authValidator,
  ...sessionValidator,
  passwordValidator
};