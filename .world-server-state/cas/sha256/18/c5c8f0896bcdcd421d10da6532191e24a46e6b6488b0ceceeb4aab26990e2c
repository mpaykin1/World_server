extends Node
# Godot 4.x lightweight W3C/OpenTelemetry bridge. Autoload as QualityTrace.
var endpoint := "https://world-server.vercel.app/api/quality-trace"
var token := ""
func _ready():
    var e=OS.get_environment("QUALITY_TRACE_ENDPOINT"); if not e.is_empty(): endpoint=e
    token=OS.get_environment("QUALITY_TRACE_TOKEN")
func _hex(bytes:int)->String:
    var raw=Crypto.new().generate_random_bytes(bytes); return raw.hex_encode()
func emit_span(name:String,duration_ms:float,attributes:Dictionary={},status:String="OK",traceparent:String="") -> void:
    if token.is_empty(): return
    var trace_id=_hex(16); var parent=""
    var parts=traceparent.split("-")
    if parts.size()==4 and parts[0]=="00" and parts[1].length()==32 and parts[2].length()==16:
        trace_id=parts[1]; parent=parts[2]
    var span_id=_hex(8)
    var payload={"serviceName":"godot-runtime","name":name,"durationMs":max(0.0,duration_ms),"status":"ERROR" if status=="ERROR" else "OK","attributes":attributes,"traceparent":"00-%s-%s-01" % [trace_id,parent if not parent.is_empty() else span_id],"spanId":span_id,"parentSpanId":parent}
    var req=HTTPRequest.new(); add_child(req); req.request_completed.connect(func(_r,_c,_h,_b): req.queue_free())
    req.request(endpoint,["Content-Type: application/json","Authorization: Bearer %s" % token],HTTPClient.METHOD_POST,JSON.stringify(payload))
