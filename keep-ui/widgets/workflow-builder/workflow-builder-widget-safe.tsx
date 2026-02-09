"use client";

import {
  WorkflowBuilderWidget,
  WorkflowBuilderWidgetProps,
} from "./workflow-builder-widget";

export function WorkflowBuilderWidgetSafe(props: WorkflowBuilderWidgetProps) {
  return <WorkflowBuilderWidget {...props} />;
}
