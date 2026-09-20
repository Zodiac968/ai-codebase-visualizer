import React from "react";
import { BaseEdge } from "@xyflow/react";

function createTrunkPath(
  sourceX,
  sourceY,
  targetX,
  targetY,
  trunkX,
  r = 8,
  offset = 20,
) {
  if (!trunkX) {
    return `M ${sourceX} ${sourceY} L ${sourceX} ${targetY} L ${targetX} ${targetY}`;
  }

  const cornerY = sourceY + offset;

  // Directions (-1 or +1)
  const dirX1 = trunkX > sourceX ? 1 : -1;
  const dirX2 = targetX > trunkX ? 1 : -1;
  const dirY = targetY > cornerY ? 1 : -1;

  // Corner radii bounds
  const r1 = Math.min(
    r,
    Math.abs(trunkX - sourceX) / 2,
    Math.abs(cornerY - sourceY),
  );
  const r2 = Math.min(
    r,
    Math.abs(trunkX - sourceX) / 2,
    Math.abs(targetY - cornerY) / 2,
  );
  const r3 = Math.min(
    r,
    Math.abs(targetX - trunkX) / 2,
    Math.abs(targetY - cornerY) / 2,
  );

  return [
    `M ${sourceX} ${sourceY}`,
    `L ${sourceX} ${cornerY - r1 * dirY}`,
    `Q ${sourceX} ${cornerY}, ${sourceX + r1 * dirX1} ${cornerY}`,
    `L ${trunkX - r2 * dirX1} ${cornerY}`,
    `Q ${trunkX} ${cornerY}, ${trunkX} ${cornerY + r2 * dirY}`,
    `L ${trunkX} ${targetY - r3 * dirY}`,
    `Q ${trunkX} ${targetY}, ${trunkX + r3 * dirX2} ${targetY}`,
    `L ${targetX} ${targetY}`,
  ].join(" ");
}

export default function TrunkEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  style,
  markerEnd,
  data,
}) {
  const edgePath = createTrunkPath(
    sourceX,
    sourceY,
    targetX,
    targetY,
    data?.trunkX,
  );

  return (
    <BaseEdge
      id={id}
      path={edgePath}
      style={style || { stroke: "#cccccc", strokeWidth: 1.5 }}
      markerEnd={markerEnd}
    />
  );
}
