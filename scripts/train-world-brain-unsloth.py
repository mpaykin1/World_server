#!/usr/bin/env python3
"""Free-first Unsloth trainer for World_server specialist model candidates.

This script is intentionally NOT imported or executed by the production server.
Run it in a compatible external GPU environment (for example, free Google Colab).
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
from typing import Any


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Fine-tune a World_server specialist with Unsloth QLoRA.")
    parser.add_argument("--dataset-dir", default="/content/world-brain")
    parser.add_argument("--model", default="unsloth/Qwen3-4B-unsloth-bnb-4bit")
    parser.add_argument("--output-dir", default="/content/world-brain-model")
    parser.add_argument("--max-seq-length", type=int, default=2048)
    parser.add_argument("--max-steps", type=int, default=60)
    parser.add_argument("--lora-rank", type=int, default=16)
    parser.add_argument("--learning-rate", type=float, default=2e-4)
    parser.add_argument("--export-gguf", action="store_true")
    parser.add_argument("--gguf-quantization", default="q4_k_m")
    return parser.parse_args()


def load_manifest(dataset_dir: Path) -> dict[str, Any]:
    return json.loads((dataset_dir / "manifest.json").read_text(encoding="utf-8"))


def main() -> int:
    args = parse_args()
    dataset_dir = Path(args.dataset_dir)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    for name in ("train.jsonl", "validation.jsonl", "manifest.json"):
        if not (dataset_dir / name).exists():
            raise SystemExit(f"Missing required dataset file: {dataset_dir / name}")

    manifest = load_manifest(dataset_dir)
    train_count = int(manifest.get("counts", {}).get("train", 0))
    if train_count < 2:
        raise SystemExit("Training dataset is too small. Prepare more verified World_server lessons first.")

    import torch

    if not torch.cuda.is_available():
        raise SystemExit(
            "A compatible GPU runtime is required. Do not run heavy training on the World_server production host "
            "or the user's CPU-only PC. In Colab choose Runtime -> Change runtime type -> GPU."
        )

    from datasets import load_dataset
    from trl import SFTConfig, SFTTrainer
    from unsloth import FastLanguageModel, is_bfloat16_supported

    model, tokenizer = FastLanguageModel.from_pretrained(
        model_name=args.model,
        max_seq_length=args.max_seq_length,
        dtype=None,
        load_in_4bit=True,
    )

    model = FastLanguageModel.get_peft_model(
        model,
        r=args.lora_rank,
        target_modules=[
            "q_proj", "k_proj", "v_proj", "o_proj",
            "gate_proj", "up_proj", "down_proj",
        ],
        lora_alpha=args.lora_rank,
        lora_dropout=0,
        bias="none",
        use_gradient_checkpointing="unsloth",
        random_state=3407,
        use_rslora=False,
        loftq_config=None,
    )

    data = load_dataset(
        "json",
        data_files={
            "train": str(dataset_dir / "train.jsonl"),
            "validation": str(dataset_dir / "validation.jsonl"),
        },
    )

    def format_messages(batch: dict[str, list[Any]]) -> dict[str, list[str]]:
        return {
            "text": [
                tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=False)
                for messages in batch["messages"]
            ]
        }

    train_dataset = data["train"].map(format_messages, batched=True)
    eval_dataset = data["validation"].map(format_messages, batched=True)
    if len(eval_dataset) == 0:
        eval_dataset = train_dataset.select(range(min(2, len(train_dataset))))

    training_args = SFTConfig(
        output_dir=str(output_dir / "trainer"),
        dataset_text_field="text",
        max_length=args.max_seq_length,
        dataset_num_proc=1,
        packing=False,
        per_device_train_batch_size=1,
        per_device_eval_batch_size=1,
        gradient_accumulation_steps=4,
        warmup_steps=min(5, max(0, args.max_steps // 10)),
        max_steps=args.max_steps,
        learning_rate=args.learning_rate,
        fp16=not is_bfloat16_supported(),
        bf16=is_bfloat16_supported(),
        logging_steps=1,
        optim="adamw_8bit",
        weight_decay=0.01,
        lr_scheduler_type="linear",
        seed=3407,
        report_to="none",
    )

    trainer = SFTTrainer(
        model=model,
        processing_class=tokenizer,
        train_dataset=train_dataset,
        eval_dataset=eval_dataset,
        args=training_args,
    )

    before = trainer.evaluate()
    train_result = trainer.train()
    after = trainer.evaluate()

    base_eval_loss = float(before.get("eval_loss", math.inf))
    candidate_eval_loss = float(after.get("eval_loss", math.inf))
    improved = math.isfinite(base_eval_loss) and math.isfinite(candidate_eval_loss) and candidate_eval_loss < base_eval_loss
    improvement_pct = (
        ((base_eval_loss - candidate_eval_loss) / base_eval_loss) * 100.0
        if improved and base_eval_loss > 0
        else 0.0
    )

    lora_dir = output_dir / "lora"
    model.save_pretrained(str(lora_dir))
    tokenizer.save_pretrained(str(lora_dir))

    gguf_dir = None
    if args.export_gguf:
        gguf_dir = output_dir / "gguf"
        model.save_pretrained_gguf(
            str(gguf_dir),
            tokenizer,
            quantization_method=args.gguf_quantization,
        )

    minimum_examples = 8
    promotable_by_loss = improved and train_count >= minimum_examples

    metrics = {
        "system": "WORLD_BRAIN_FACTORY",
        "provider": "unsloth",
        "model": args.model,
        "sourceCommit": manifest.get("sourceCommit"),
        "datasetPolicyHash": manifest.get("policyHash"),
        "trainExamples": train_count,
        "validationExamples": int(manifest.get("counts", {}).get("validation", 0)),
        "baseEvalLoss": base_eval_loss,
        "candidateEvalLoss": candidate_eval_loss,
        "validationLossImprovementPercent": improvement_pct,
        "trainRuntime": getattr(train_result, "metrics", {}),
        "promotableByValidationLoss": promotable_by_loss,
        "productionPromoted": False,
        "requiresRealTaskBenchmark": True,
        "requiresHumanReviewedPR": True,
        "loraDir": str(lora_dir),
        "ggufDir": str(gguf_dir) if gguf_dir else None,
    }

    (output_dir / "metrics.json").write_text(json.dumps(metrics, indent=2, default=str) + "\n", encoding="utf-8")
    candidate_manifest = {
        "schemaVersion": "1.0.0",
        "status": "candidate" if promotable_by_loss else "rejected_or_needs_more_evidence",
        "model": args.model,
        "metricsFile": "metrics.json",
        "productionPromoted": False,
        "reason": (
            "Validation loss improved; candidate still requires a real World_server task benchmark and reviewed PR."
            if promotable_by_loss
            else "Validation loss did not improve or the verified dataset is below the minimum size."
        ),
    }
    (output_dir / "candidate-manifest.json").write_text(
        json.dumps(candidate_manifest, indent=2) + "\n",
        encoding="utf-8",
    )

    print(json.dumps(metrics, indent=2, default=str))
    return 0 if improved else 3


if __name__ == "__main__":
    raise SystemExit(main())
