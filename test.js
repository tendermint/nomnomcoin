var tmsp = require("js-tmsp");
var types = require("./types");
var crypto = require("./crypto");

var pair = crypto.genKeyPair();
var pubKeyBytes = pair.pubKeyBytes;
var privKeyBytes = pair.privKeyBytes;
var msgBytes = new Buffer("foobar");
var sigBytes = crypto.sign(privKeyBytes, msgBytes);
var ok = crypto.verify(pubKeyBytes, msgBytes, sigBytes);
if (!ok) {
  throw "invalid signature";
}

var input = new types.Input({
  pubKey: pubKeyBytes,
  amount:123,
  sequence: 0,
});
var signBytes = input.encode().toBuffer();
var sigBytes = crypto.sign(privKeyBytes, signBytes);

var tx = new types.Tx({
  inputs: [
    {pubKey: pubKeyBytes, amount:123, signature: sigBytes},
    {pubKey: pubKeyBytes, amount:123, signature: sigBytes},
  ],
  outputs: [
    {pubKey: pubKeyBytes, amount:123},
  ]
});

var tmsp = require("js-tmsp");
var c = new tmsp.Client("tcp://127.0.0.1:46658");

c.appendTx(tx.encode(), (res) => {
  if (res.code == tmsp.CodeType.OK) {
    console.log("appendTx success!");
  } else {
    console.log("appendTx failed! log: ", res.log);
  }
});
c.flush();
