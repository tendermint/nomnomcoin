var wire = require("js-wire");
var tmsp = require("js-tmsp");
var util = require("util");

var version = "0.1";

function Nomnomcoin(){
};

Nomnomcoin.prototype.info = function(cb) {
  return cb("Nomnomcoin v"+version);
}

Nomnomcoin.prototype.setOption = function(cb, key, value) {
  return cb("");
}

Nomnomcoin.prototype.appendTx = function(cb, txBytes) {
	return cb(tmsp.RetCodeOK, "", "");
}

Nomnomcoin.prototype.checkTx = function(cb, txBytes) {
	return cb(tmsp.RetCodeOK, "", "");
}

Nomnomcoin.prototype.getHash = function(cb) {
  var buf = new Buffer(20);
  cb(buf, "");
}

Nomnomcoin.prototype.query = function(cb) {
  return cb("", "Query not yet supporrted");
}

console.log("Nomnomcoin v"+version);

var app = new Nomnomcoin();
var appServer = new tmsp.AppServer(app);
appServer.server.listen(46658);

/*
var ProtoBuf = require("protobufjs"),
		ByteBuffer = ProtoBuf.ByteBuffer,                    // ProtoBuf.js uses and also exposes ByteBuffer.js
		Long = ProtoBuf.Long;                                // as well as Long.js (not used in this example)

// Option 1: Loading the .proto file directly
var builder = ProtoBuf.loadProtoFile("./types.proto"),   // Creates the Builder
		types = builder.build("types");                      // Returns just the 'js' namespace if that's all we need

var pubKeyEd25519 = new types.PubKeyEd25519(new ByteBuffer().writeString("aaa").flip());
var pubKey = new types.PubKey(pubKeyEd25519);

console.log(new types.Account({
  "pubKey": pubKey,
}));
*/
