"""The native probe must preserve geometry as points, partitions and frames change."""
import unittest

import numpy as np

from geometry import SAMPLES, _geometry_from_buffers, _geometry_uncached, _sample_curve, bezier, geometry


class ProbeGeometry(unittest.TestCase):
    def setUp(self):
        _geometry_from_buffers.cache_clear()

    def test_straight_curve_has_known_bounds_length_and_area(self):
        path = np.array([[0., 0., 0.], [1., 0., 0.], [2., 0., 0.]])
        self.assertEqual(geometry([path], 2), ([0., 0., 2., 0.], 2., 0.))

    def test_broadcast_sampling_is_identical_to_scalar_bezier(self):
        rng = np.random.default_rng(49)
        for degree in [2, 3]:
            for dtype in [np.float32, np.float64]:
                for scale in [1e-5, 1, 1e5, 1e10]:
                    with self.subTest(degree=degree, dtype=dtype, scale=scale):
                        for _ in range(6):
                            points = (rng.normal(size=(degree + 1, 2)) * scale).astype(dtype)
                            np.testing.assert_array_equal(
                                _sample_curve(points), np.array([bezier(points, t) for t in SAMPLES]))

    def test_cache_matches_scalar_oracle_for_both_libraries_and_dtypes(self):
        rng = np.random.default_rng(42)
        for degree in [2, 3]:
            for dtype in [np.float32, np.float64]:
                for count in [1, 3, 7]:
                    with self.subTest(degree=degree, dtype=dtype, count=count):
                        paths = [rng.normal(size=(degree * 4 + 4, 3)).astype(dtype)
                                 for _ in range(count)]
                        self.assertEqual(geometry(paths, degree), _geometry_uncached(paths, degree))
                        self.assertEqual(geometry([p.copy() for p in paths], degree),
                                         _geometry_uncached(paths, degree))
                        paths[0][0, 0] += 0.25
                        self.assertEqual(geometry(paths, degree), _geometry_uncached(paths, degree))

    def test_mutating_points_does_not_reuse_previous_frame_geometry(self):
        path = np.array([[0., 0., 0.], [1., 0., 0.], [2., 0., 0.]])
        before = geometry([path], 2)
        path[:, 0] += 10
        self.assertEqual(geometry([path], 2), ([10., 0., 12., 0.], 2., 0.))
        self.assertEqual(before, ([0., 0., 2., 0.], 2., 0.))

    def test_subpath_partition_is_part_of_identity(self):
        a = np.array([[0., 0., 0.], [.5, 1., 0.], [1., 0., 0.]])
        b = a + [4, 0, 0]
        separate = geometry([a, b], 2)
        joined = geometry([np.concatenate([a, b])], 2)
        self.assertNotEqual(separate, joined)
        self.assertEqual(separate, _geometry_uncached([a, b], 2))
        self.assertEqual(joined, _geometry_uncached([np.concatenate([a, b])], 2))

    def test_equal_point_copies_hit_cache_without_sharing_mutable_output(self):
        path = np.array([[0., 0., 0.], [1., 0., 0.], [2., 0., 0.]])
        first = geometry([path], 2)
        first[0][0] = 999
        self.assertEqual(geometry([path.copy()], 2), ([0., 0., 2., 0.], 2., 0.))
        self.assertEqual(_geometry_from_buffers.cache_info().hits, 1)

    def test_empty_and_gl_jump_paths_remain_undrawn(self):
        self.assertIsNone(geometry([], 2))
        jump = np.array([[0., 0., 0.], [0., 0., 0.], [2., 0., 0.]])
        self.assertIsNone(geometry([jump], 2))
        jump[1, 1] = 0.001
        self.assertEqual(geometry([jump], 2), _geometry_uncached([jump], 2))
        self.assertIsNotNone(geometry([jump], 2))

    def test_large_geometry_uses_same_oracle_without_retaining_large_keys(self):
        rng = np.random.default_rng(8)
        paths = [rng.normal(size=(28, 3)) for _ in range(40)]
        self.assertEqual(geometry(paths, 2), _geometry_uncached(paths, 2))
        self.assertEqual(_geometry_from_buffers.cache_info().currsize, 0)


if __name__ == '__main__':
    unittest.main()
