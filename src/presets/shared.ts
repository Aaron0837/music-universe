import * as THREE from 'three';

export function seeded(index: number, salt = 1): number {
  const value = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

export function disposeObject(root: THREE.Object3D): void {
  root.traverse((item) => {
    const mesh = item as THREE.Mesh;
    mesh.geometry?.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    materials.forEach((material) => material.dispose());
  });
  root.removeFromParent();
}
