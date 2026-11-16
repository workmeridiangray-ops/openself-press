"""Validate a local Google feed; --upload stages it in private R2 via boto3.

Credentials are environment variables, never command arguments or printed output.
Install boto3 separately only when staging: python3 -m pip install boto3
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re

PREFIX = 'distribution/google-play/A0HEG97/'
PATH = re.compile(r'(?:onix/(?:validate|A0HEG97-(?:full|rights))/[A-Za-z0-9_]+\.xml|ebooks/A0HEG97/[0-9]{13}(?:_interior\.pdf|_frontcover\.jpg|\.epub))')

def validate(directory):
    root = Path(directory).resolve()
    manifest = json.loads((root / 'active.json').read_text())
    if manifest.get('collection') != 'A0HEG97' or not re.fullmatch(r'[A-Za-z0-9]{1,64}', manifest.get('release', '')):
        raise ValueError('Invalid collection/release')
    files = manifest.get('files', [])
    if not files or len(files) > 5000:
        raise ValueError('Invalid file count')
    seen = set()
    payloads = []
    for entry in files:
        name = entry['path']
        if not PATH.fullmatch(name) or name in seen or entry['key'] != PREFIX + manifest['release'] + '/' + name:
            raise ValueError('Invalid feed path')
        seen.add(name)
        local = (root / name).resolve()
        if root not in local.parents:
            raise ValueError('File outside release')
        body = local.read_bytes()
        if len(body) != entry['size'] or hashlib.sha256(body).hexdigest() != entry['sha256']:
            raise ValueError('File changed after packaging')
        payloads.append((entry, body))
    return manifest, payloads

def stage(client, bucket, manifest, payloads):
    # HEAD active before writing; only switch it if no other operator changed it.
    try:
        prior = client.head_object(Bucket=bucket, Key=PREFIX + 'active.json')
    except client.exceptions.ClientError as exc:
        if str(exc.response['Error']['Code']) not in ('404', 'NoSuchKey', 'NotFound'):
            raise
        prior = None
    for entry, body in payloads:
        try:
            client.put_object(Bucket=bucket, Key=entry['key'], Body=body,
                              ContentType=entry['contentType'], Metadata={'sha256': entry['sha256']}, IfNoneMatch='*')
        except client.exceptions.ClientError as exc:
            if str(exc.response['Error']['Code']) not in ('412', 'PreconditionFailed'):
                raise
        # Verify bytes, not only self-reported metadata, before activating anything.
        stored = client.get_object(Bucket=bucket, Key=entry['key'])
        if hashlib.sha256(stored['Body'].read()).hexdigest() != entry['sha256'] or stored.get('Metadata', {}).get('sha256') != entry['sha256']:
            raise ValueError('Remote release differs; choose a new release ID')
    data = json.dumps(manifest, indent=2).encode()
    client.put_object(Bucket=bucket, Key=PREFIX + manifest['release'] + '/manifest.json', Body=data, ContentType='application/json')
    condition = {'IfMatch': prior['ETag']} if prior else {'IfNoneMatch': '*'}
    client.put_object(Bucket=bucket, Key=PREFIX + 'active.json', Body=data, ContentType='application/json', **condition)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory')
    parser.add_argument('--upload', action='store_true', help='Write this approved release to private R2')
    args = parser.parse_args()
    manifest, payloads = validate(args.directory)
    if not args.upload:
        print(f'Validated {len(payloads)} local files. No upload performed.')
        return
    import boto3
    account = os.environ['GOOGLE_BOOKS_R2_ACCOUNT_ID']
    if not re.fullmatch(r'[a-f0-9]{32}', account):
        raise ValueError('Invalid Cloudflare account ID')
    client = boto3.client('s3', endpoint_url=f'https://{account}.r2.cloudflarestorage.com', region_name='auto',
                          aws_access_key_id=os.environ['GOOGLE_BOOKS_R2_ACCESS_KEY_ID'],
                          aws_secret_access_key=os.environ['GOOGLE_BOOKS_R2_SECRET_ACCESS_KEY'])
    stage(client, os.environ['GOOGLE_BOOKS_R2_BUCKET'], manifest, payloads)
    print('Staged release. Worker feed mode and Google approval control availability.')

if __name__ == '__main__':
    main()
