// Dựng ảnh nhiều góc nhìn từ file .glb để lập chỉ mục tìm kiếm bằng ảnh (YC-AI-05). Dùng three.js trực tiếp
// (không qua React) với một khung vẽ WebGL dùng lại cho mọi sản phẩm. Dáng mặc định chọn giống khung xem 3D
// của cửa hàng (src/components/three/Stage.tsx): dáng đứng đầu tiên, không có thì dạng cuối của clip biến hình.
// Chỉ dùng ở client.
import {
  ACESFilmicToneMapping,
  AnimationMixer,
  Color,
  DirectionalLight,
  HemisphereLight,
  MathUtils,
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  type AnimationClip,
  type Material,
  type Mesh,
  type Object3D,
  type SkinnedMesh,
  type Texture,
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { measure, poseAt, restore, snapshot } from "@/components/three/Stage";
import type { FormKey, ViewSpec } from "@/lib/image-search";
import { getModelFeatures } from "@/lib/model-features";

const FOV = 30;

export type ModelForm = { form: FormKey; label: string };

export type LoadedModel = {
  forms: ModelForm[];
  // Đặt mô hình vào một dạng; trả về tâm và bán kính hình cầu bao để đặt camera.
  pose(form: FormKey): { center: Vector3; radius: number };
  root: Object3D;
};

function disposeObject(root: Object3D) {
  root.traverse((node) => {
    const mesh = node as Mesh;
    mesh.geometry?.dispose();
    const materials = mesh.material ? ([] as Material[]).concat(mesh.material) : [];
    for (const material of materials) {
      for (const value of Object.values(material)) if ((value as Texture | null)?.isTexture) (value as Texture).dispose();
      material.dispose();
    }
  });
}

export class ViewRenderer {
  readonly size: number;
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(FOV, 1, 0.01, 100);
  private hemi = new HemisphereLight(0xffffff, 0x444444, 1);
  private sun = new DirectionalLight(0xffffff, 1.5);
  private loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  private current: Object3D | null = null;

  constructor(size = 256) {
    this.size = size;
    this.renderer = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: false });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(size, size, false);
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    const pmrem = new PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.scene.add(this.hemi, this.sun);
  }

  get canvas(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  async load(url: string): Promise<LoadedModel> {
    this.unload();
    const gltf = await this.loader.loadAsync(url);
    const root = gltf.scene;
    const animations: AnimationClip[] = gltf.animations ?? [];
    const features = getModelFeatures(url);
    const findClip = (name: string | undefined) => animations.find((clip) => clip.name === name) ?? null;
    const poses = (features?.poses ?? []).filter((pose) => findClip(pose.clip));
    const transformClip = findClip(features?.transform?.clip);
    const mixer = new AnimationMixer(root);
    // Vùng bao của mesh có xương không theo hoạt ảnh; chỉ có một mô hình trong cảnh nên luôn vẽ.
    root.traverse((node) => {
      if ((node as SkinnedMesh).isSkinnedMesh) node.frustumCulled = false;
    });
    const rest = snapshot(root);

    const forms: ModelForm[] = [{ form: "default", label: features?.transform?.kind === "transform" ? features.transform.to : (poses[0]?.label ?? "") }];
    // Dạng biến hình (ví dụ dạng xe của Transformers) là một nguyên mẫu riêng; bộ hợp thể thì dạng đầu là các
    // thành viên rời nhau (đã là sản phẩm riêng) nên bỏ qua.
    if (transformClip && features?.transform?.kind === "transform") forms.push({ form: "alt", label: features.transform.from });

    const apply = (form: FormKey) => {
      mixer.stopAllAction();
      restore(rest);
      if (form === "alt" && transformClip) poseAt(mixer, transformClip, 0);
      else if (poses[0]) poseAt(mixer, findClip(poses[0].clip)!, poses[0].at);
      else if (transformClip) poseAt(mixer, transformClip, 1);
      root.updateMatrixWorld(true);
    };

    this.scene.add(root);
    this.current = root;
    return {
      forms,
      root,
      pose(form) {
        apply(form);
        const box = measure(root);
        return { center: box.getCenter(new Vector3()), radius: Math.max(box.getSize(new Vector3()).length() / 2, 1e-4) };
      },
    };
  }

  // Vẽ một góc nhìn; khung vẽ (this.canvas) giữ ảnh tới lần vẽ sau.
  render(model: LoadedModel, view: ViewSpec): HTMLCanvasElement {
    const { center, radius } = model.pose(view.form);
    const azimuth = MathUtils.degToRad(view.azimuth);
    const elevation = MathUtils.degToRad(view.elevation);
    const distance = (radius / Math.sin(MathUtils.degToRad(FOV / 2))) * view.distance;
    const direction = new Vector3(Math.cos(elevation) * Math.sin(azimuth), Math.sin(elevation), Math.cos(elevation) * Math.cos(azimuth));
    this.camera.position.copy(center).addScaledVector(direction, distance);
    this.camera.near = Math.max(distance - radius * 2, distance / 100);
    this.camera.far = distance + radius * 4;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(center);
    // Đèn chính lệch 40° so với camera, từ trên cao xuống.
    const light = azimuth + MathUtils.degToRad(40);
    this.sun.position.set(center.x + Math.sin(light) * radius * 3, center.y + radius * 3, center.z + Math.cos(light) * radius * 3);
    this.sun.target.position.copy(center);
    this.sun.target.updateMatrixWorld();
    this.sun.intensity = 1.5 * view.light;
    this.hemi.intensity = 1 * view.light;
    this.scene.environmentIntensity = 0.6 + 0.4 * view.light;
    this.scene.background = new Color(view.background);
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement;
  }

  unload() {
    if (!this.current) return;
    this.scene.remove(this.current);
    disposeObject(this.current);
    this.current = null;
  }

  dispose() {
    this.unload();
    this.scene.environment?.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
