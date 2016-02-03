var nacl_factory = require('js-nacl');
var nacl = nacl_factory.instantiate();

function verify(pubKeyBytes, msgBytes, sigBytes) {
  return nacl.crypto_sign_verify_detached(sigBytes, msgBytes, pubKeyBytes);
}

function sign(privKeyBytes, msgBytes) {
  return nacl.crypto_sign_detached(msgBytes, privKeyBytes);
}

function genKeyPair() {
  var keypair = nacl.crypto_sign_keypair();
  var privKeyBytes = keypair.signSk;
  var pubKeyBytes = keypair.signPk;
  return {privKeyBytes:privKeyBytes, pubKeyBytes:pubKeyBytes};
}

module.exports = {
  verify: verify,
  sign: sign,
  genKeyPair: genKeyPair,
};

