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
  if (req.key == "give") { // Give users some coins, for initialization
    var opts = JSON.parse(req.value);
    var seed = opts.seed;
    var balance = opts.balance;
    var pair = crypto.deriveKeyPair(seed);
    eyesCli.set(
      pair.pubKeyBytes,
      new types.Account({balance:balance}).encode().toBuffer(),
      (res) => {
        var logMsg = "User "+seed+" balance set to "+balance;
        console.log(logMsg);
        cb({log:logMsg});
      }
    );
  } else {
    return cb({log:"Unrecognized option key "+req.key});
  }
}

Nomnomcoin.prototype.appendTx = function(req, cb) {
  // Decode and validate tx
  var tx;
  try {
    tx = types.Tx.decode(req.data);
  } catch(err) {
    return cb({code:tmsp.CodeType.EncodingError, log:''+err});
  }
  if (!validateTx(tx, cb)) {
    return;
  }
  loadAccounts(this.eyesCli, allPubKeys(tx), (accMap) => {
    // Execute transaction
    var accounts = [];
    if (!execTx(tx, accMap, accounts, cb)) {
      return;
    }
    // Save result
    storeAccounts(this.eyesCli, accounts);
    return cb({code:tmsp.CodeType.OK});
  });
}

Nomnomcoin.prototype.checkTx = function(req, cb) {
  // Decode and validate tx
  var tx;
  try {
    tx = types.Tx.decode(req.data);
  } catch(err) {
    return cb({code:tmsp.CodeType.EncodingError, log:''+err});
  }
  if (!validateTx(tx, cb)) {
    return;
  }
  loadAccounts(this.eyesCli, allPubKeys(tx), (accMap) => {
    // Execute transaction
    if (!execTx(tx, accMap, [], cb)) {
      return;
    }
    // Do not save anything
    return cb({code:tmsp.CodeType.OK});
  });
}

Nomnomcoin.prototype.getHash = function(req, cb) {
  this.eyesCli.getHash((hash) => {
    cb({data: hash});
  });
}

Nomnomcoin.prototype.query = function(req, cb) {
  var queryBytes = req.data.toBuffer();
  eyesCli.get(queryBytes, (accBytes)=>{
    return cb({code:tmsp.CodeType.OK, log:"Query not yet supported"});
  });
}

//----------------------------------------

// Loads accounts in batch from eyesCli
// Calls loadAccountsCb(accountMap).
// Ignores unknown accounts.
function loadAccounts(eyesCli, pubKeys, loadAccountsCb) {
  // Reads can happen in any order, in parallel.
  async.map(pubKeys, function(pubKeyBytes, cb) {
    eyesCli.get(pubKeyBytes, (accBytes)=>{
      if (accBytes.length == 0) {
        cb(null, null);
      } else {
        var acc = types.Account.decode(accBytes);
        acc._pubKey = pubKeyBytes;
        cb(null, acc);
      };
    });
  }, function(err, accounts) {
    // We have a list of accounts now, some null.
    // The order is the same as that of pubKeys.
    // Create a map out of them.
    if (!!err) {
      throw "This shouldn't happen";
    }
    var accountsMap = accounts.reduce((m,acc) => {
      if (!acc) { return m; }
      m[acc._pubKey.toString("binary")] = acc;
      return m;
    }, {});
    loadAccountsCb(accountsMap);
  });
  // TODO: If eyesCli didn't auto-flush,
  // We'd want to flush once here.
}

// Stores accounts in batch to eyesCli
// NOTE: this function takes no callbacks.
function storeAccounts(eyesCli, accounts) {
  // Writes must happen in deterministic order.
  for (var i=0; i<accounts.length; i++) {
    var acc = accounts[i];
    eyesCli.set(acc._pubKey, acc.encode().toBuffer()); 
  }
}

//----------------------------------------

function validateTx(tx, cb) {
  if (tx.inputs.length == 0) {
    cb({code:tmsp.CodeType.EncodingError, log:"Tx.inputs.length cannot be 0"});
    return false;
  }
  var seenPubKeys = {};
  var signBytes = txSignBytes(tx);
  for (var i=0; i<tx.inputs.length; i++) {
    var input = tx.inputs[i];
    if (!validateInput(input, signBytes, cb)) {
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

function txSignBytes(tx) {
  var txCopy = new types.Tx(tx.toRaw());
  txCopy.inputs.forEach((input) => {
    input.signature = new Buffer(0);
  });
  return txCopy.encode().toBuffer();
}

function validateInput(input, signBytes, cb) {
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
        signBytes,
        input.signature.toBuffer())) {
    cb({code:tmsp.CodeType.Unauthorized, log:"Invalid signature"});
    return false;
  }
  return true;
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

function allPubKeys(tx) {
  var inputKeys = tx.inputs.map((input) => {return input.pubKey.toBuffer();});
  var outputKeys = tx.outputs.map((output) => {return output.pubKey.toBuffer();});
  return inputKeys.concat(outputKeys);
}

// Executs transaction, while filling in accounts
// with updated account data in order of appearance in tx.
// We want this deterministic order for saving.
function execTx(tx, accMap, accounts, cb) {
  // Deduct from inputs
  for (var i=0; i<tx.inputs.length; i++) {
    var input = tx.inputs[i];
    var acc = accMap[input.pubKey.toBinary()];
    if (!acc) {
      cb({code:tmsp.CodeType.UnknownAccount, log:"Input account does not exist"});
      return false;
    }
    if (acc.sequence != input.sequence) {
      cb({code:tmsp.CodeType.BadNonce, log:"Invalid sequence"});
      return false;
    }
    if (acc.balance.lt(input.amount)) {
      cb({code:tmsp.CodeType.InsufficientFunds, log:"Insufficent funds"});
      return false;
    }
    // Good!
    acc.sequence++;
    acc.balance = acc.balance.sub(input.amount);
    accounts.push(acc);
  }
  // Add to outputs
  for (var i=0; i<tx.outputs.length; i++) {
    var output = tx.outputs[i];
    var acc = accMap[output.pubKey.toBinary()];
    // Create new account if it doesn't already exist.
    if (!acc) {
      acc = new types.Account({
        balance:  output.amount,
        sequence: 0,
      });
      acc._pubKey = output.pubKey.toBuffer();
      accMap[output.pubKey.toBinary()] = acc;
      continue;
    }
    // Good!
    acc.balance = acc.balance.add(output.amount);
    accounts.push(acc);
  }
  return true;
}

//----------------------------------------

var program = require('commander');
program
  .version(version)
  .option('-e, --eyes [tcp://host:port|unix://path]', 'MerkleEyes address (default tcp://127.0.0.1:46659)')
  .parse(process.argv);
var eyesCli = new eyes.Client(program.eyes || "tcp://127.0.0.1:46659");
var app = new Nomnomcoin(eyesCli);
var appServer = new tmsp.Server(app);
appServer.server.listen(46658); // TODO Make arg option
