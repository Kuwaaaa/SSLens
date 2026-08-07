import { bootContentRuntime } from "./content/bootstrap";
import { Overlay } from "./content/Overlay";

void bootContentRuntime(({ url, roomId, canonical }) => (
  <Overlay key={roomId} url={url} roomId={roomId} canonical={canonical} />
));
