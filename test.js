var tmsp = require("js-tmsp");
var types = require("./types");
var crypto = require("./crypto");
var async = require("async");

function getUser(seed) {
  var user = crypto.deriveKeyPair(seed);
  user.sequence = 0;
  return user
}

function input(user, amount) {
  var input = new types.Input({
    pubKey:   user.pubKeyBytes,
    sequence: user.sequence,
    amount:   amount,
  });
  input._user = user;
  return input;
}

function output(user, amount) {
  var output = new types.Output({
    pubKey:   user.pubKeyBytes,
    amount:   amount,
  });
  output._user = user;
  return output;
}

function tx(inputs, outputs) {
  var tx = new types.Tx({
    inputs:   inputs,
    outputs:  outputs,
  });
  var signBytes = tx.encode().toBuffer();
  //console.log(">>", signBytes);
  tx.inputs.forEach((input) => {
    input.signature = crypto.sign(input._user.privKeyBytes, signBytes);
  });
  return tx;
}

function setOption(cli, key, value, cb) {
  cli.setOption(key, value, ()=>{
    cb();});
  cli.flush();
}

function appendTx(cli, tx, code, cb) {
  cli.appendTx(tx.encode().toBuffer(), (res) => {
    if (res.code != code) {
      console.log("tx got unexpected code! Wanted "+code+" but got "+res.code+". log: "+res.log);
    }
    if (res.code == tmsp.CodeType.OK) {
      tx.inputs.forEach((input) => {
        input._user.sequence++;
      });
    }
    cb();
  });
  cli.flush();
}

var cli = new tmsp.Client("tcp://127.0.0.1:46658");

// Actual tests here
var user1 = getUser("user1");
var user2 = getUser("user2");
var user3 = getUser("user3");
var user4 = getUser("user4");
var user5 = getUser("user5");
async.series([
(cb)=>{ setOption(cli, "give", JSON.stringify({seed:"user1", balance:100}), cb); },
(cb)=>{ appendTx(cli, tx([input(user1, 10)], [output(user2, 8)]), tmsp.CodeType.OK, cb); },
(cb)=>{ appendTx(cli, tx([input(user1, 10)], [output(user2, 8)]), tmsp.CodeType.OK, cb); },
(cb)=>{ appendTx(cli, tx([input(user1, 10)], [output(user2, 8)]), tmsp.CodeType.OK, cb); },
(cb)=>{ appendTx(cli, tx([input(user1, 10)], [output(user2, 8)]), tmsp.CodeType.OK, cb); },
(cb)=>{ appendTx(cli, tx([input(user1, 10)], [output(user2, 9)]), tmsp.CodeType.InsufficientFees, cb); },
(cb)=>{ appendTx(cli, tx([input(user1, 10)], [output(user2, 100)]), tmsp.CodeType.InsufficientFees, cb); },
(cb)=>{ appendTx(cli, tx([input(user1, 1000)], [output(user2, 8)]), tmsp.CodeType.InsufficientFunds, cb); },
(cb)=>{
  // After all tests have run:
  console.log("Done!");
  cli.close();
  cb();
}]);
