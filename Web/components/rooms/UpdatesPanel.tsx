"use client";
/** Rooms → My Room: the page visitors see when they peek, and once they're in. */
import MyRoomPanel from "./MyRoomPanel";

export default function UpdatesPanel() {
  return (
    <div className="mx-updates">
      <h3 className="mx-h">Your Room</h3>
      <p className="mx-note">What they see when they peek, and once they’re in.</p>
      <MyRoomPanel />
    </div>
  );
}
