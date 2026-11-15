// Forgejo's runner protocol (code.forgejo.org/forgejo/actions-proto), runner.v1 and ping.v1, without comments or imports.
export const PROTO = `



message RegisterRequest {
  string name = 1;
  string token = 2;
  repeated string agent_labels = 3 [deprecated = true];
  repeated string custom_labels = 4 [deprecated = true];
  string version = 5;
  repeated string labels = 6;
  bool ephemeral = 7;
}

message RegisterResponse {
  Runner runner = 1;
}

message DeclareRequest {
  string version = 1;
  repeated string labels = 2;
}

message DeclareResponse {
  Runner runner = 1;
}

message FetchTaskRequest {
  int64 tasks_version = 1;
  optional int64 task_capacity = 2;
}

message FetchTaskResponse {
  Task task = 1;

  int64 tasks_version = 2;

  repeated Task additional_tasks = 3;
}

message FetchSingleTaskRequest {
  int64 tasks_version = 1;
  optional string handle = 2;
}

message FetchSingleTaskResponse {
  int64 tasks_version = 1;

  Task task = 2;
}

message UpdateTaskRequest {
  TaskState state = 1;
  map<string, string> outputs = 2; 
}

message UpdateTaskResponse {
  TaskState state = 1;
  repeated string sent_outputs = 2; 
}

message UpdateLogRequest {
  int64 task_id = 1;
  int64 index = 2; 
  repeated LogRow rows = 3;
  bool no_more = 4; 
}

message UpdateLogResponse {
  int64 ack_index = 1; 
}

message StepSummary {
  int64 step_number = 1; 
  string content = 2; 
}

message UpdateStepSummaryRequest {
  int64 task_id = 1;
  repeated StepSummary summaries = 2;
}

message UpdateStepSummaryResponse {}

message Runner {
  int64 id = 1;
  string uuid = 2;
  string token = 3;
  string name = 4;
  RunnerStatus status = 5;
  repeated string agent_labels = 6 [deprecated = true];
  repeated string custom_labels = 7 [deprecated = true];
  string version = 8;
  repeated string labels = 9;
  bool ephemeral = 10;
}

enum RunnerStatus {
  RUNNER_STATUS_UNSPECIFIED = 0;
  RUNNER_STATUS_IDLE = 1;
  RUNNER_STATUS_ACTIVE = 2;
  RUNNER_STATUS_OFFLINE = 3;
}

enum Result {
  RESULT_UNSPECIFIED = 0;
  RESULT_SUCCESS = 1;
  RESULT_FAILURE = 2;
  RESULT_CANCELLED = 3;
  RESULT_SKIPPED = 4;
}

message Task {
  int64 id = 1; 
  optional bytes workflow_payload = 2; 
  optional google.protobuf.Struct context = 3; 
  map<string, string> secrets = 4; 
  string machine = 5 [deprecated = true]; 
  map<string, TaskNeed> needs = 6; 
  map<string, string> vars = 7; 
}

message TaskNeed {
  map<string, string> outputs = 1; 
  Result result = 2; 
}

message TaskState {
  int64 id = 1;
  Result result = 2;
  google.protobuf.Timestamp started_at = 3;
  google.protobuf.Timestamp stopped_at = 4;
  repeated StepState steps = 5;
}

message StepState {
  int64 id = 1;
  Result result = 2;
  google.protobuf.Timestamp started_at = 3;
  google.protobuf.Timestamp stopped_at = 4;
  int64 log_index = 5; 
  int64 log_length = 6; 
}

message LogRow {
  google.protobuf.Timestamp time = 1;
  string content = 2;
}


message PingRequest {
  string data = 1;
}

message PingResponse {
  string data = 1;
}
`;
