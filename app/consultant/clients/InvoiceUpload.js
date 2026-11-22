import BatchInvoiceUpload from "../factures/BatchInvoiceUpload";

export default function InvoiceUpload({ clientId, today }) {
  return <BatchInvoiceUpload clientId={clientId} today={today} />;
}
