import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from '../../server/node_modules/vitest';
import { VerificationSequencePanel } from '../src/components/brand/MarkSureLoader';

const report = {
  current_version: 1, student: { roll_number: 'TEST-ONLY' },
  signature_valid: true, merkle_proof_valid: true, leaf_index: 0,
  direct_db_tampering_detected: false, verification_status: 'VERIFIED',
};

describe('Authoritative verification feedback', () => {
  it('never displays a stale successful verdict while a new request is pending', () => {
    const html = renderToStaticMarkup(<VerificationSequencePanel loading report={report} />);
    expect(html).toContain('Awaiting the server');
    expect(html).not.toContain('VERIFIED');
    expect(html).not.toContain('Pipeline Complete');
    expect(html).not.toContain('Step 0');
  });
  it('renders nothing when there is neither a request nor a report', () => {
    expect(renderToStaticMarkup(<VerificationSequencePanel loading={false} report={null} />)).toBe('');
  });
  it('keeps signature, proof and database outcomes separate', () => {
    const html = renderToStaticMarkup(<VerificationSequencePanel loading={false} report={{...report,
      signature_valid: false, merkle_proof_valid: false,
      direct_db_tampering_detected: true, tampered_fields: ['marks'], verification_status: 'TAMPERED',
    }} />);
    expect(html).toContain('signature verification failed');
    expect(html).toContain('Merkle proof path failed');
    expect(html).toContain('Mismatch detected: 1');
    expect(html).toContain('Final verdict: TAMPERED');
    expect(html).not.toContain('All live database subject marks match');
  });
  it('renders all five stages only after a report arrives', () => {
    const html = renderToStaticMarkup(<VerificationSequencePanel loading={false} report={report} />);
    expect(html.match(/Step 0/g)).toHaveLength(5);
    expect(html).toContain('Final verdict: VERIFIED');
    expect(html).toContain('ms-loader-static');
  });
});
