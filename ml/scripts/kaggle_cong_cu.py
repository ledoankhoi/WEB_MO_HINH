"""Gọi Kaggle API cho `dieu_phoi.py`. Chạy bằng môi trường riêng ml/.venv-cloud (gói `kaggle`), không lẫn vào môi trường thí nghiệm.
In đúng một dòng JSON ở cuối (máy đọc). Đăng nhập một lần: ml/.venv-cloud/Scripts/kaggle auth login (mở trình duyệt).

  ml/.venv-cloud/Scripts/python ml/scripts/kaggle_cong_cu.py whoami
  ml/.venv-cloud/Scripts/python ml/scripts/kaggle_cong_cu.py dataset-create --folder ml/data/store/cloud/kaggle-anh --slug robotica-anh-b04
  ml/.venv-cloud/Scripts/python ml/scripts/kaggle_cong_cu.py dataset-status --slug robotica-anh-b04
  ml/.venv-cloud/Scripts/python ml/scripts/kaggle_cong_cu.py push --folder <thư mục có kernel-metadata.json>
  ml/.venv-cloud/Scripts/python ml/scripts/kaggle_cong_cu.py status --kernel robotica-b06-vit
  ml/.venv-cloud/Scripts/python ml/scripts/kaggle_cong_cu.py output --kernel robotica-b06-vit --path <thư mục>
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]


def normalize(status: object) -> str:
    text = str(status).lower()
    for key in ("complete", "error", "cancel", "running", "queued", "ready", "pending"):
        if key in text:
            return key
    return text


def main() -> None:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("whoami")
    sub.add_parser("quota")
    create = sub.add_parser("dataset-create")
    create.add_argument("--folder", required=True)
    create.add_argument("--slug", required=True)
    status_ds = sub.add_parser("dataset-status")
    status_ds.add_argument("--slug", required=True)
    push = sub.add_parser("push")
    push.add_argument("--folder", required=True)
    push.add_argument("--acc", default="NvidiaTeslaT4")  # "GPU T4 x2"
    for name in ("status", "output"):
        p = sub.add_parser(name)
        p.add_argument("--kernel", required=True, help="tên kernel (không cần tên người dùng)")
        if name == "output":
            p.add_argument("--path", required=True)
    args = parser.parse_args()

    from kaggle.api.kaggle_api_extended import KaggleApi

    api = KaggleApi()
    api.authenticate()
    user = api.get_config_value(api.CONFIG_NAME_USER)
    out: dict = {"user": user}
    if args.cmd == "quota":
        out["quota"] = str(api.get_accelerator_quota_statistics()) if hasattr(api, "get_accelerator_quota_statistics") else None
    elif args.cmd == "dataset-create":
        folder = Path(args.folder)
        meta = {"title": args.slug, "id": f"{user}/{args.slug}", "licenses": [{"name": "other"}],
                "description": "Ảnh train/val của B4 (ROBOTICA, luận văn). Chỉ dùng nghiên cứu, riêng tư, không phân phối lại."}
        (folder / "dataset-metadata.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
        response = api.dataset_create_new(str(folder), public=False, quiet=True, convert_to_csv=False, dir_mode="skip")
        out.update(ref=getattr(response, "ref", None), url=getattr(response, "url", None), status=str(getattr(response, "status", None)),
                   error=getattr(response, "error", None) or None)
    elif args.cmd == "dataset-status":
        out["status"] = normalize(api.dataset_status(f"{user}/{args.slug}"))
    elif args.cmd == "push":
        response = api.kernels_push(args.folder, None, args.acc)
        out.update(ref=getattr(response, "ref", None), url=getattr(response, "url", None), version=getattr(response, "version_number", None),
                   error=getattr(response, "error", None) or None)
    elif args.cmd == "status":
        response = api.kernels_status(f"{user}/{args.kernel}")
        out.update(status=normalize(response.status), message=getattr(response, "failure_message", None) or None)
    elif args.cmd == "output":
        files, _ = api.kernels_output(f"{user}/{args.kernel}", args.path, force=True, quiet=True)
        out["files"] = len(files)
    print(json.dumps(out, ensure_ascii=False, default=str))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:  # noqa: BLE001 - trả lỗi dạng JSON cho dieu_phoi.py
        print(json.dumps({"error": f"{type(error).__name__}: {error}"}, ensure_ascii=False))
        sys.exit(1)
