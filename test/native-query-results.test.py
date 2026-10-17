import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'reader' / 'native_query'))
from inprocess import InProcessQuery, Request


class NativeResultsTest(unittest.TestCase):
    def test_fatal_errors_never_become_zero_prices_or_interest(self):
        for mask in (0x80000000, 0x40000000):
            for happiness in (False, True):
                with self.subTest(mask=mask, happiness=happiness):
                    query = object.__new__(InProcessQuery)
                    result = Request()
                    result.results[0].errorMask = mask
                    query._request = lambda *args: None
                    query._send = lambda request: result
                    rows = query.query_batch([(123, {})], happiness=happiness)
                    self.assertEqual(set(rows[0]), {'id', 'error'})


if __name__ == '__main__':
    unittest.main()
