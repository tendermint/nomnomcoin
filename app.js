var wire = require("js-wire");
var tmsp = require("js-tmsp");
var eyes = require("js-merkleeyes");
var util = require("util");
var Long = require("long");
var types = require("./types");
var crypto = require("./crypto");

var version = "0.1";

function Nomnomcoin(eyesCli){
  this.eyesCli = eyesCli;
};

Nomnomcoin.prototype.info = function(req, cb) {
  return cb({
    data: "Nomnomcoin v"+version,
  });
}

Nomnomcoin.prototype.setOption = function(req, cb) {
  return cb({log:"No options supported"});
}

Nomnomcoin.prototype.appendTx = function(req, cb) {
  var tx;
  try {
    tx = types.Tx.decode(req.data);
  } catch(err) {
    return cb({code:tmsp.CodeType.EncodingError, log:''+err});
  }
  if (!validateTx(tx, cb)) {
    return;
  }
  return cb({code:tmsp.CodeType.OK});
}

Nomnomcoin.prototype.checkTx = function(req, cb) {
  return cb({code:tmsp.CodeType.OK});
}

Nomnomcoin.prototype.getHash = function(req, cb) {
  var hash = new Buffer(20);
  return cb({data: hash});
}

Nomnomcoin.prototype.query = function(req, cb) {
  return cb({code:tmsp.CodeType.OK, log:"Query not yet supported"});
}

console.log("Nomnomcoin v"+version);
var eyesCli = new eyes.Client("tcp://127.0.0.1:46659");
var app = new Nomnomcoin(eyesCli);
var appServer = new tmsp.Server(app);
appServer.server.listen(46658);

//----------------------------------------

function validateTx(tx, cb) {
  if (tx.inputs.length == 0) {
    cb({code:tmsp.CodeType.EncodingError, log:"tx.inputs.length cannot be 0"});
    return false;
  }
  for (var i=0; i<tx.inputs.length; i++) {
    if (!validateInput(tx.inputs[i], cb)) {
      return false;
    }
  }
  for (var i=0; i<tx.outputs.length; i++) {
    if (!validateOutput(tx.outputs[i], cb)) {
      return false;
    }
  }
  if (sumAmount(tx.inputs).lt(
      sumAmount(tx.outputs).add(tx.inputs.length+tx.outputs.length))) {
    cb({code:tmsp.CodeType.InsufficientFees});
    return false;
  }
  return true;
}

function validateInput(input, cb) {
  if (input.amount.isZero()) {
    cb({code:tmsp.CodeType.EncodingError, log:"input amount cannot be zero"});
    return false;
  }
  if (input.amount.isNegative()) {
    throw("SHOULD NOT BE NEGATIVE"); // This should not happen
  }
  if (len(input.pubKey) != 32) {
    cb({code:tmsp.CodeType.EncodingError, log:"input pubKey must be 32 bytes long"});
    return false;
  }
  if (len(input.signature) != 64) {
    cb({code:tmsp.CodeType.EncodingError, log:"input signature must be 64 bytes long"});
    return false;
  }
  if (!crypto.verify(
        input.pubKey.toBuffer(),
        input2SignBytes(input),
        input.signature.toBuffer())) {
    cb({code:tmsp.CodeType.Unauthorized, log:"invalid signature"});
    return false;
  }
  return true;
}

function input2SignBytes(input) {
  return new types.Input({
    pubKey: input.pubKey,
    amount: input.amount,
    sequence: input.sequence,
  }).encode().toBuffer();
}

function validateOutput(output, cb) {
  if (output.amount.isZero()) {
    cb({code:tmsp.CodeType.EncodingError, log:"output amount cannot be zero"});
    return false;
  }
  if (output.amount.isNegative()) {
    throw("SHOULD NOT BE NEGATIVE"); // This should not happen
  }
  if (len(output.pubKey) != 32) {
    cb({code:tmsp.CodeType.EncodingError, log:"output pubKey must be 32 bytes long"});
    return false;
  }
  return true;
}

// things: array of inputs or outputs.
function sumAmount(things) {
  var sum = new Long(0);
  things.forEach((th) => {
    sum = sum.add(th.amount);
  });
  return sum;
}

function len(bb) {
  return bb.limit - bb.offset;
}
