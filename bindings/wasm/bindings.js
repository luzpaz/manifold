// Copyright 2022 The Manifold Authors.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

var _ManifoldInitialized = false;
Module.setup = function () {
  if (_ManifoldInitialized) return;
  _ManifoldInitialized = true;

  function toVec(vec, list, f = x => x) {
    if (list != null) {
      for (let x of list) {
        vec.push_back(f(x));
      }
    }
    return vec;
  }

  function fromVec(vec, f = x => x) {
    const result = [];
    const size = vec.size();
    for (let i = 0; i < size; i++)
      result.push(f(vec.get(i)));
    return result;
  }

  function polygons2vec(polygons) {
    if (polygons[0].length < 3) {
      polygons = [polygons];
    }
    return toVec(
      new Module.Vector2_vec2(), polygons,
      poly => toVec(new Module.Vector_vec2(), poly, p => {
        if (p instanceof Array) return { x: p[0], y: p[1] };
        return p;
      }));
  }

  function disposePolygons(polygonsVec) {
    for (let i = 0; i < polygonsVec.size(); i++) polygonsVec.get(i).delete();
    polygonsVec.delete();
  }

  function mesh2vec(mesh) {
    const vertPos = toVec(new Module.Vector_vec3, mesh.vertPos, p => {
      return { x: p[0], y: p[1], z: p[2] }
    });
    const triVerts = toVec(new Module.Vector_ivec3, mesh.triVerts);
    const vertNormal = toVec(new Module.Vector_vec3, mesh.vertNormal, p => {
      return { x: p[0], y: p[1], z: p[2] }
    });
    const halfedgeTangent = toVec(new Module.Vector_vec4, mesh.halfedgeTangent, p => {
      return { x: p[0], y: p[1], z: p[2], w: p[3] }
    });
    return { vertPos, triVerts, vertNormal, halfedgeTangent };
  }

  function disposeMesh(meshVec) {
    meshVec.vertPos.delete();
    meshVec.triVerts.delete();
    meshVec.vertNormal.delete();
    meshVec.halfedgeTangent.delete();
  }

  function vararg2vec(vec) {
    if (vec[0] instanceof Array)
      return { x: vec[0][0], y: vec[0][1], z: vec[0][2] };
    if (typeof (vec[0]) == 'number')
      // default to 0
      return { x: vec[0] || 0, y: vec[1] || 0, z: vec[2] || 0 };
    return vec[0];
  }

  Module.Manifold.prototype.warp = function (func) {
    const wasmFuncPtr = addFunction(function (vec3Ptr) {
      const x = getValue(vec3Ptr, 'float');
      const y = getValue(vec3Ptr + 4, 'float');
      const z = getValue(vec3Ptr + 8, 'float');
      const vert = [x, y, z];
      func(vert);
      setValue(vec3Ptr, vert[0], 'float');
      setValue(vec3Ptr + 4, vert[1], 'float');
      setValue(vec3Ptr + 8, vert[2], 'float');
    }, 'vi');
    const out = this._Warp(wasmFuncPtr);
    removeFunction(wasmFuncPtr);
    return out;
  };

  // note that the matrix is using column major (same as glm)
  Module.Manifold.prototype.transform = function (mat) {
    console.assert(mat.length == 4, 'expects a 3x4 matrix');
    const vec = new Module.Vector_f32();
    for (let col of mat) {
      console.assert(col.length == 3, 'expects a 3x4 matrix');
      for (let x of col) mat.push_back(x);
    }
    const result = this._Transform(vec);
    vec.delete();
    return result;
  };

  Module.Manifold.prototype.translate = function (...vec) {
    return this._Translate(vararg2vec(vec));
  };

  Module.Manifold.prototype.rotate = function (vec) {
    return this._Rotate(...vec);
  };

  Module.Manifold.prototype.scale = function (vec) {
    if (typeof vec == 'number') {
      return this._Scale({ x: vec, y: vec, z: vec });
    }
    return this._Scale(vararg2vec([vec]));
  };

  Module.Manifold.prototype.decompose = function () {
    const vec = this._Decompose();
    const result = fromVec(vec);
    vec.delete();
    return result;
  };

  Module.Manifold.prototype.getCurvature = function () {
    const result = this._getCurvature();
    const oldMeanCurvature = result.vertMeanCurvature;
    const oldGaussianCurvature = result.vertGaussianCurvature;
    result.vertMeanCurvature = fromVec(oldMeanCurvature);
    result.vertGaussianCurvature = fromVec(oldGaussianCurvature);
    oldMeanCurvature.delete();
    oldGaussianCurvature.delete();
    return result;
  };

  Module.Manifold.prototype.getMesh = function () {
    const result = this._GetMesh();
    const oldVertPos = result.vertPos;
    const oldTriVerts = result.triVerts;
    const oldVertNormal = result.vertNormal;
    const oldHalfedgeTangent = result.halfedgeTangent;
    const conversion1 = v => ['x', 'y', 'z'].map(f => v[f]);
    const conversion2 = v => ['x', 'y', 'z', 'w'].map(f => v[f]);
    result.vertPos = fromVec(oldVertPos, conversion1);
    result.triVerts = fromVec(oldTriVerts);
    result.vertNormal = fromVec(oldVertNormal, conversion1);
    result.halfedgeTangent = fromVec(oldHalfedgeTangent, conversion2);
    oldVertPos.delete();
    oldTriVerts.delete();
    oldVertNormal.delete();
    oldHalfedgeTangent.delete();
    return result;
  };

  Module.Manifold.prototype.getMeshRelation = function () {
    const result = this._getMeshRelation();
    const oldBarycentric = result.barycentric;
    const oldTriBary = result.triBary;
    const conversion1 = v => ['x', 'y', 'z'].map(f => v[f]);
    const conversion2 = v => {
      return {
        meshID: v.meshID,
        originalID: v.originalID,
        tri: v.tri,
        vertBary: conversion1(v.vertBary)
      };
    };
    result.barycentric = fromVec(oldBarycentric, conversion1);
    result.triBary = fromVec(oldTriBary, conversion2);
    oldBarycentric.delete();
    oldTriBary.delete();
    return result;
  };

  Module.Manifold.prototype.boundingBox = function () {
    const result = this._boundingBox();
    return {
      min: ['x', 'y', 'z'].map(f => result.min[f]),
      max: ['x', 'y', 'z'].map(f => result.max[f]),
    };
  };

  Module.cube = function (...args) {
    let size = undefined;
    if (args.length == 0)
      size = { x: 1, y: 1, z: 1 };
    else if (typeof args[0] == 'number')
      size = { x: args[0], y: args[0], z: args[0] };
    else
      size = vararg2vec(args);
    const center = args[1] || false;
    return Module._Cube(size, center);
  };

  Module.cylinder = function (
    height, radiusLow, radiusHigh = -1.0, circularSegments = 0,
    center = false) {
    return Module._Cylinder(
      height, radiusLow, radiusHigh, circularSegments, center);
  };

  Module.sphere = function (radius, circularSegments = 0) {
    return Module._Sphere(radius, circularSegments);
  };

  Module.smooth = function (mesh, sharpenedEdges = []) {
    const meshVec = mesh2vec(mesh);
    const sharp = new Module.Vector_smoothness();
    toVec(sharp, sharpenedEdges);
    const result = Module._Smooth(meshVec, sharp);
    sharp.delete();
    disposeMesh(meshVec);
    return result;
  };

  Module.extrude = function (
    polygons, height, nDivisions = 0, twistDegrees = 0.0,
    scaleTop = [1.0, 1.0]) {
    if (scaleTop instanceof Array) scaleTop = { x: scaleTop[0], y: scaleTop[1] };
    const polygonsVec = polygons2vec(polygons);
    const result = Module._Extrude(
      polygonsVec, height, nDivisions, twistDegrees, scaleTop);
    disposePolygons(polygonsVec);
    return result;
  };

  Module.revolve = function (polygons, circularSegments = 0) {
    const polygonsVec = polygons2vec(polygons);
    const result = Module._Revolve(polygonsVec, circularSegments);
    disposePolygons(polygonsVec);
    return result;
  };

  Module.compose = function (manifolds) {
    const vec = new Module.Vector_manifold();
    toVec(vec, manifolds);
    const result = Module._Compose(vec);
    vec.delete();
    return result;
  };

  Module.levelSet = function (sdf, bounds, edgeLength, level = 0) {
    const bounds2 = {
      min: { x: bounds.min[0], y: bounds.min[1], z: bounds.min[2] },
      max: { x: bounds.max[0], y: bounds.max[1], z: bounds.max[2] },
    };
    const wasmFuncPtr = addFunction(function (vec3Ptr) {
      const x = getValue(vec3Ptr, 'float');
      const y = getValue(vec3Ptr + 4, 'float');
      const z = getValue(vec3Ptr + 8, 'float');
      const vert = [x, y, z];
      return sdf(vert);
    }, 'fi');
    const out = Module._LevelSet(wasmFuncPtr, bounds2, edgeLength, level);
    removeFunction(wasmFuncPtr);
    return out;
  }

  function batchbool(name) {
    return function (...args) {
      if (args.length == 1)
        args = args[0];
      const v = new Module.Vector_manifold();
      for (const m of args)
        v.push_back(m);
      const result = Module['_' + name + 'N'](v);
      v.delete();
      return result;
    }
  }

  Module.union = batchbool('union');
  Module.difference = batchbool('difference');
  Module.intersection = batchbool('intersection');
};
