import { Store } from "../../../..";
import { getCompositeComponentFromElement } from "../../inspect-element/utils";

export const RenderPropsAndState = () => {

  const inspectState = Store.inspectState.value;

  if (inspectState.kind !== 'focused') {
    return null;
  }

  const { parentCompositeFiber } = getCompositeComponentFromElement(inspectState.focusedDomElement);

  if (!parentCompositeFiber) {
    return;
  }

  const reportDataFiber =
    Store.reportData.get(parentCompositeFiber) ??
    (parentCompositeFiber.alternate
      ? Store.reportData.get(parentCompositeFiber.alternate)
      : null);

  const componentName = parentCompositeFiber.type?.displayName || parentCompositeFiber.type?.name || 'Unknown';
  const renderCount = reportDataFiber?.count ?? 0;
  const renderTime = reportDataFiber?.time ?? 0;

  return (
    <div className="react-scan-header">
      <div className="react-scan-header-left">
        <span className="react-scan-component-name">{componentName}</span>
        <span className="react-scan-metrics">
          {renderCount > 0 ? `${renderCount} renders` : ''}
          {renderCount > 0 && renderTime > 0 ? ' • ' : ''}
          {renderTime > 0 ? `${renderTime?.toFixed(2)}ms` : ''}
        </span>
      </div>
    </div>
  )
};
