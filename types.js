function xport(exports, m) {
  for (var key in m) {
    exports[key] = m[key];
  }
}

var proto = require("protobufjs");
var protoPath = require("path").join(__dirname, "types.proto"); // TODO: better to just compile this into a js file.
var builder = proto.loadProtoFile(protoPath);
var types = builder.build("types");

module.exports = types;
