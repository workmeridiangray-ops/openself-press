import importlib.util
import hashlib
import io
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('uploader', Path(__file__).parents[1] / 'scripts/upload-google-books-feed.py')
uploader = importlib.util.module_from_spec(spec)
spec.loader.exec_module(uploader)

class Error(Exception):
    def __init__(self, code):
        self.response = {'Error': {'Code': code}}

class Client:
    class exceptions:
        ClientError = Error
    def __init__(self, corrupt=False, race=False):
        self.objects = {}
        self.writes = []
        self.corrupt = corrupt
        self.race = race
    def head_object(self, **kw):
        if kw['Key'] not in self.objects:
            raise Error('404')
        return {'ETag': 'old'}
    def put_object(self, **kw):
        key = kw['Key']
        if kw.get('IfNoneMatch') == '*' and (key in self.objects or self.race and key.endswith('active.json')):
            raise Error('412')
        self.objects[key] = kw
        self.writes.append(key)
    def get_object(self, **kw):
        obj = self.objects[kw['Key']]
        return {'Body': io.BytesIO(b'corrupt' if self.corrupt else obj['Body']), 'Metadata': obj.get('Metadata', {})}

class UploadTests(unittest.TestCase):
    def setUp(self):
        self.body = b'<xml/>'
        self.entry = {'key': uploader.PREFIX + 'Release1/onix/validate/sample.xml', 'sha256': hashlib.sha256(self.body).hexdigest(), 'contentType': 'application/xml'}
        self.manifest = {'release': 'Release1'}
    def test_active_last_and_repeat_is_safe(self):
        c = Client()
        uploader.stage(c, 'bucket', self.manifest, [(self.entry, self.body)])
        self.assertEqual(c.writes[-1], uploader.PREFIX + 'active.json')
        uploader.stage(c, 'bucket', self.manifest, [(self.entry, self.body)])
        self.assertEqual(c.writes.count(self.entry['key']), 1)
    def test_corruption_never_switches_active(self):
        c = Client(corrupt=True)
        with self.assertRaises(ValueError):
            uploader.stage(c, 'bucket', self.manifest, [(self.entry, self.body)])
        self.assertNotIn(uploader.PREFIX + 'active.json', c.objects)
    def test_concurrent_activation_is_not_overwritten(self):
        c = Client(race=True)
        with self.assertRaises(Error):
            uploader.stage(c, 'bucket', self.manifest, [(self.entry, self.body)])
        self.assertNotIn(uploader.PREFIX + 'active.json', c.objects)

if __name__ == '__main__':
    unittest.main()
