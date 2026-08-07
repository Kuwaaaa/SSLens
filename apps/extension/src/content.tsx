import { bootContentRuntime } from "./content/bootstrap";
import { Overlay } from "./content/Overlay";

function startContentRuntime() {
  return bootContentRuntime(({ url, roomId, canonical }) => (
    <Overlay key={roomId} url={url} roomId={roomId} canonical={canonical} />
  ));
}

export function onExecute() {
  void startContentRuntime();
}

void startContentRuntime();
