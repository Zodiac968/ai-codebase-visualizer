import { Handle, Position } from "@xyflow/react";

export default function CustomNode({ data }) {
  return (
    <div className="custom-node">
      {/* Target Handles */}
      <Handle type="target" position={Position.Top} id="top" />
      <Handle type="target" position={Position.Left} id="left" />
      <Handle type="target" position={Position.Right} id="right" />

      {/* Specific Target Handles for Relationships */}
      <Handle
        type="target"
        position={Position.Left}
        id="left-in"
        style={{ top: "75%" }}
      />
      <Handle
        type="target"
        position={Position.Right}
        id="right-in"
        style={{ top: "75%" }}
      />

      <div>{data.label}</div>

      {/* Source Handles */}
      <Handle type="source" position={Position.Bottom} id="bottom" />

      {/* Specific Source Handles for Relationships */}
      <Handle
        type="source"
        position={Position.Left}
        id="left-out"
        style={{ top: "25%" }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="right-out"
        style={{ top: "25%" }}
      />
    </div>
  );
}
