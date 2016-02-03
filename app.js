var async = require("async");
var util = require("util");
var Long = require("long");
var wire = require("js-wire");
var tmsp = require("js-tmsp");
var eyes = require("js-merkleeyes");
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
  var inputKeys = tx.inputs.map((input) => {return input.pubKey.toBuffer();});
  var outputKeys = tx.outputs.map((output) => {return output.pubKey.toBuffer();});
  loadAccounts(
    inputKeys.concat(outputKeys),
    this.eyesCli,
    (accMap) => {
      // Deduct from inputs
      for (var i=0; i<tx.inputs.length; i++) {
        var input = tx.inputs[i];
        var acc = accMap[input.pubKey.toBinary()];
        if (!acc) {
          return cb({code:tmsp.CodeType.UnknownAccount, log:"Input account does not exist"});
        }
        if (acc.sequence != input.sequence) {
          return cb({code:tmsp.CodeType.BadNonce, log:"Invalid sequence"});
        }
        if (acc.balance.lt(input.amount)) {
          return cb({code:tmsp.CodeType.InsufficientFunds, log:"Insufficent funds"});
        }
        // Good!
        acc.sequence++;
        acc.balance = acc.balance.sub(input.amount);
      }
      // Add to outputs
      for (var i=0; i<tx.outputs.length; i++) {
        var output = tx.outputs[i];
        var acc = accMap[output.pubKey.toBinary()];
        if (!acc) { // Create new account
          accMap[output.pubKey.toBinary()] = new types.Account({
            balance:  output.amount,
            sequence: 0,
          });
          continue;
        }
        // Good!
        acc.balance = acc.balance.add(output.amount);
      }
      // Update accounts
      XXX
      console.log("new accounts", accMap);
      return cb({code:tmsp.CodeType.OK});
    }
  );
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

//----------------------------------------

// Loads accounts in parallel from eyesCli
// Calls loadAccountsCb(accountMap).
// Ignores unknown accounts.
function loadAccounts(pubKeys, eyesCli, loadAccountsCb) {
  async.map(pubKeys, function(pubKeyBytes, cb) {
    eyesCli.get(pubKeyBytes, (accBytes)=>{
      console.log("loaded", pubKeyBytes);
      if (accBytes.length == 0) {
        cb(null, null);
      } else {
        var acc = types.Account.decode(accBytes);
        cb(null, acc);
      };
    });
  }, function(err, accounts) {
    var accountsMap = accounts.reduce((m,acc) => {
      if (!acc) { return m; }
      m[acc.pubKey.toBinary()] = acc;
      return m;
    }, {});
    loadAccountsCb(accountsMap);
  });
}

//----------------------------------------

console.log("Nomnomcoin v"+version);
var eyesCli = new eyes.Client("tcp://127.0.0.1:46659");
var app = new Nomnomcoin(eyesCli);
var appServer = new tmsp.Server(app);
appServer.server.listen(46658);

// XXX move out
function makeAccount(seed, balance) {
  var pair = crypto.deriveKeyPair(seed);
  return {
    pubKey:   pair.pubKeyBytes,
    data: {
      balance:  balance,
      sequence: 0,
    }
  };
}
var user1 = makeAccount("user1", 300);
var user2 = makeAccount("user2", 300);
eyesCli.set(user1.pubKey, new types.Account(user1.data).encode().toBuffer(), (res) => {
  console.log("set user1", res);
});
eyesCli.set(user2.pubKey, new types.Account(user2.data).encode().toBuffer(), (res) => {
  console.log("set user2", res);
});

//----------------------------------------

function validateTx(tx, cb) {
  if (tx.inputs.length == 0) {
    cb({code:tmsp.CodeType.EncodingError, log:"Tx.inputs.length cannot be 0"});
    return false;
  }
  var seenPubKeys = {};
  for (var i=0; i<tx.inputs.length; i++) {
    var input = tx.inputs[i];
    if (!validateInput(input, cb)) {
      return false;
    }
    var pubKeyBin = input.pubKey.toBinary();
    if (seenPubKeys[pubKeyBin]) {
      cb({code:tmsp.CodeType.EncodingError, log:"Duplicate input pubKey"});
      return false;
    }
    seenPubKeys[pubKeyBin] = true;
  }
  for (var i=0; i<tx.outputs.length; i++) {
    var output = tx.outputs[i];
    if (!validateOutput(output, cb)) {
      return false;
    }
    var pubKeyBin = output.pubKey.toBinary();
    if (seenPubKeys[pubKeyBin]) {
      cb({code:tmsp.CodeType.EncodingError, log:"Duplicate output/input pubKey"});
      return false;
    }
    seenPubKeys[pubKeyBin] = true;
  }
  if (sumAmount(tx.inputs).lt(
      sumAmount(tx.outputs).add(tx.inputs.length+tx.outputs.length))) {
    cb({code:tmsp.CodeType.InsufficientFees, log:"Insufficient fees"});
    return false;
  }
  return true;
}

function validateInput(input, cb) {
  if (input.amount.isZero()) {
    cb({code:tmsp.CodeType.EncodingError, log:"Input amount cannot be zero"});
    return false;
  }
  if (input.amount.isNegative()) {
    throw("SHOULD NOT BE NEGATIVE"); // This should not happen
  }
  if (len(input.pubKey) != 32) {
    cb({code:tmsp.CodeType.EncodingError, log:"Input pubKey must be 32 bytes long"});
    return false;
  }
  if (len(input.signature) != 64) {
    cb({code:tmsp.CodeType.EncodingError, log:"Input signature must be 64 bytes long"});
    return false;
  }
  if (!crypto.verify(
        input.pubKey.toBuffer(),
        input2SignBytes(input),
        input.signature.toBuffer())) {
    cb({code:tmsp.CodeType.Unauthorized, log:"Invalid signature"});
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
    cb({code:tmsp.CodeType.EncodingError, log:"Output amount cannot be zero"});
    return false;
  }
  if (output.amount.isNegative()) {
    throw("SHOULD NOT BE NEGATIVE"); // This should not happen
  }
  if (len(output.pubKey) != 32) {
    cb({code:tmsp.CodeType.EncodingError, log:"Output pubKey must be 32 bytes long"});
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
