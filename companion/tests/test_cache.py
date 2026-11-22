"""The disk cache stays within its limit: at start-up and as results are written (F7)."""
import os
import tempfile
import time
import unittest

from support import make_companion


def json_files(directory: str) -> list[str]:
    return sorted(name for name in os.listdir(directory) if name.endswith(".json"))


class DiskCacheLimit(unittest.TestCase):
    def test_writing_past_the_limit_drops_the_oldest_entries(self):
        with tempfile.TemporaryDirectory() as tmp:
            companion = make_companion(disk_cache=True, cache_dir=tmp, disk_cache_max_files=2)
            for i in range(5):
                companion._cache_put(f"k{i}", {"svg": "<svg/>", "glyphs": []})
                time.sleep(0.01)  # distinct modification times
            self.assertLessEqual(len(json_files(tmp)), 2)
            self.assertIn("k4.json", json_files(tmp))
            # The newest entry is still served from disk once the memory cache forgets it.
            companion._memory = type(companion._memory)(1)
            self.assertIsNotNone(companion._cache_get("k4"))
            self.assertIsNone(companion._cache_get("k0"))

    def test_start_up_prunes_a_cache_over_the_limit_down_to_three_quarters(self):
        with tempfile.TemporaryDirectory() as tmp:
            for i in range(10):
                path = os.path.join(tmp, f"k{i}.json")
                with open(path, "w", encoding="utf-8") as fh:
                    fh.write("{}")
                os.utime(path, (1_700_000_000 + i, 1_700_000_000 + i))
            make_companion(disk_cache=True, cache_dir=tmp, disk_cache_max_files=4)
            self.assertEqual(json_files(tmp), ["k7.json", "k8.json", "k9.json"])

    def test_a_cache_within_the_limit_is_left_alone(self):
        with tempfile.TemporaryDirectory() as tmp:
            companion = make_companion(disk_cache=True, cache_dir=tmp, disk_cache_max_files=4)
            for i in range(4):
                companion._cache_put(f"k{i}", {"svg": "<svg/>", "glyphs": []})
            self.assertEqual(json_files(tmp), ["k0.json", "k1.json", "k2.json", "k3.json"])


if __name__ == "__main__":
    unittest.main()
