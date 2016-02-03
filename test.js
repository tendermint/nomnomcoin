var tmsp = require("js-tmsp");
var types = require("./types");
var crypto = require("./crypto");

var pair1 = crypto.deriveKeyPair("user1");
var pubKey1Bytes = pair1.pubKeyBytes;
var privKey1Bytes = pair1.privKeyBytes;
/*
var msgBytes = new Buffer("foobar");
var sigBytes = crypto.sign(privKeyBytes, msgBytes);
var ok = crypto.verify(pubKeyBytes, msgBytes, sigBytes);
if (!ok) {
  throw "invalid signature";
}
*/
var pair2 = crypto.deriveKeyPair("user2");
var pubKey2Bytes = pair2.pubKeyBytes;
var privKey2Bytes = pair2.privKeyBytes;

var input = new types.Input({
  pubKey: pubKey1Bytes,
  amount:123,
  sequence: 0,
});
var signBytes = input.encode().toBuffer();
var sigBytes = crypto.sign(privKey1Bytes, signBytes);

var tx = new types.Tx({
  inputs: [
    {pubKey: pubKey1Bytes, amount:123, signature: sigBytes},
  ],
  outputs: [
    {pubKey: pubKey2Bytes, amount:121},
  ]
});

var tmsp = require("js-tmsp");
var c = new tmsp.Client("tcp://127.0.0.1:46658");

c.appendTx(tx.encode(), (res) => {
  if (res.code == tmsp.CodeType.OK) {
    console.log("appendTx success!");
  } else {
    console.log("appendTx failed! code:", res.code, "log:", res.log);
  }
});
c.flush();
