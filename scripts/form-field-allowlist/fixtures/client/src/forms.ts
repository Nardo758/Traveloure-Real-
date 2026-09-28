declare function apiRequest(method: string, url: string, data?: unknown): Promise<Response>;
declare const id: string;
declare const anyBody: any;
export async function forms() {
  await apiRequest("POST", "/api/strips", { x: "1", y: "2" });         // F1 → finding [y]
  await apiRequest("POST", "/api/strict", { x: "1", y: "2" });         // F2 → ok
  await apiRequest("PATCH", `/api/destructure/${id}`, { x: "1", y: "2" }); // F3 → ok
  await apiRequest("POST", "/api/spread", { x: "1", z: "3" });         // F4 → unchecked (open)
  await apiRequest("POST", "/api/wrapped", { x: "1", y: "2" });        // F5 → ok
  await apiRequest("POST", "/api/refuses", { x: "1" });                // F6 → ok
  await apiRequest("POST", "/api/alias", { x: "1", y: "2" });          // F7 → ok
  await apiRequest("POST", "/api/alias-missing", { x: "1", y: "2" });  // F8 → finding [y]
  await apiRequest("POST", "/api/strips", anyBody);                    // F9 → unchecked (any)
  await apiRequest("POST", "/api/nowhere", { x: "1" });                // F10 → unmatched
}
