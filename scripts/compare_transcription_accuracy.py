#!/usr/bin/env python3
"""
Why: compare Whisper ASR transcription against official YouTube subtitles
to measure character-level accuracy (CER) and word-level accuracy (WER).

Uses difflib for alignment and Levenshtein-style edit distance for CER.
"""

import re
import sys
import json
from difflib import SequenceMatcher
from collections import Counter


def parse_srt_to_plain_text(srt_content):
    """Extract plain text from SRT subtitle format, stripping timestamps and indices."""
    lines = srt_content.strip().split("\n")
    text_lines = []
    for line in lines:
        line = line.strip()
        # Why: skip SRT index numbers, timestamps, and empty lines
        if not line:
            continue
        if re.match(r"^\d+$", line):
            continue
        if re.match(r"\d{2}:\d{2}:\d{2}", line):
            continue
        text_lines.append(line)
    return "".join(text_lines)


def normalize_chinese_text(text):
    """
    Why: for fair comparison, normalize both texts by removing punctuation,
    whitespace, and converting to simplified form where possible.
    """
    # Remove all whitespace
    text = re.sub(r"\s+", "", text)
    # Remove all punctuation and special characters, keep only CJK + letters + digits
    text = re.sub(r"[^\u4e00-\u9fff\u3400-\u4dbfa-zA-Z0-9]", "", text)
    # Lowercase for English portions
    text = text.lower()
    return text


def compute_character_error_rate(reference, hypothesis):
    """
    Why: CER (Character Error Rate) = (S + D + I) / N
    where S = substitutions, D = deletions, I = insertions, N = reference length.
    Uses SequenceMatcher for efficient alignment.
    """
    ref_chars = list(reference)
    hyp_chars = list(hypothesis)

    matcher = SequenceMatcher(None, ref_chars, hyp_chars)
    opcodes = matcher.get_opcodes()

    substitutions = 0
    deletions = 0
    insertions = 0
    matches = 0

    for tag, i1, i2, j1, j2 in opcodes:
        if tag == "equal":
            matches += i2 - i1
        elif tag == "replace":
            ref_len = i2 - i1
            hyp_len = j2 - j1
            substitutions += max(ref_len, hyp_len)
        elif tag == "delete":
            deletions += i2 - i1
        elif tag == "insert":
            insertions += j2 - j1

    total_ref = len(ref_chars)
    total_errors = substitutions + deletions + insertions
    cer = total_errors / total_ref if total_ref > 0 else 0.0

    return {
        "cer": cer,
        "accuracy": 1.0 - cer,
        "matches": matches,
        "substitutions": substitutions,
        "deletions": deletions,
        "insertions": insertions,
        "ref_length": total_ref,
        "hyp_length": len(hyp_chars),
        "total_errors": total_errors,
    }


def collect_error_examples(reference, hypothesis, max_examples=30):
    """
    Why: show concrete examples of mismatches so the user can see
    what kinds of errors Whisper makes.
    """
    ref_chars = list(reference)
    hyp_chars = list(hypothesis)
    matcher = SequenceMatcher(None, ref_chars, hyp_chars)
    opcodes = matcher.get_opcodes()

    examples = {"substitutions": [], "deletions": [], "insertions": []}
    count = 0

    for tag, i1, i2, j1, j2 in opcodes:
        if count >= max_examples * 3:
            break

        # Why: extract surrounding context (5 chars before/after) for readability
        ctx_before_ref = "".join(ref_chars[max(0, i1 - 5):i1])
        ctx_after_ref = "".join(ref_chars[i2:i2 + 5])

        if tag == "replace":
            ref_span = "".join(ref_chars[i1:i2])
            hyp_span = "".join(hyp_chars[j1:j2])
            if len(examples["substitutions"]) < max_examples:
                examples["substitutions"].append({
                    "context": f"...{ctx_before_ref}[{ref_span} → {hyp_span}]{ctx_after_ref}...",
                    "reference": ref_span,
                    "hypothesis": hyp_span,
                    "position": i1,
                })
                count += 1
        elif tag == "delete":
            ref_span = "".join(ref_chars[i1:i2])
            if len(examples["deletions"]) < max_examples:
                examples["deletions"].append({
                    "context": f"...{ctx_before_ref}[-{ref_span}-]{ctx_after_ref}...",
                    "reference": ref_span,
                    "position": i1,
                })
                count += 1
        elif tag == "insert":
            hyp_span = "".join(hyp_chars[j1:j2])
            if len(examples["insertions"]) < max_examples:
                examples["insertions"].append({
                    "context": f"...{ctx_before_ref}[+{hyp_span}+]{ctx_after_ref}...",
                    "hypothesis": hyp_span,
                    "position": i1,
                })
                count += 1

    return examples


def compute_ngram_accuracy(reference, hypothesis, n=2):
    """
    Why: character bigram/trigram overlap gives a "fluency-aware" accuracy
    that penalizes word boundary errors more than single-char substitutions.
    """
    ref_ngrams = Counter(reference[i:i+n] for i in range(len(reference) - n + 1))
    hyp_ngrams = Counter(hypothesis[i:i+n] for i in range(len(hypothesis) - n + 1))

    overlap = sum((ref_ngrams & hyp_ngrams).values())
    total = sum(ref_ngrams.values())

    return overlap / total if total > 0 else 0.0


def main():
    srt_path = sys.argv[1] if len(sys.argv) > 1 else None
    asr_path = sys.argv[2] if len(sys.argv) > 2 else None

    if not srt_path or not asr_path:
        print("Usage: python compare_transcription_accuracy.py <srt_file> <asr_txt_file>")
        sys.exit(1)

    with open(srt_path, "r", encoding="utf-8") as f:
        srt_content = f.read()
    with open(asr_path, "r", encoding="utf-8") as f:
        asr_content = f.read()

    # Extract and normalize
    ref_raw = parse_srt_to_plain_text(srt_content)
    hyp_raw = asr_content.strip()

    ref_norm = normalize_chinese_text(ref_raw)
    hyp_norm = normalize_chinese_text(hyp_raw)

    print("=" * 70)
    print("  Whisper ASR vs Official Subtitles — Accuracy Report")
    print("=" * 70)
    print()
    print(f"  Reference (SRT subtitles):  {len(ref_norm)} chars (normalized)")
    print(f"  Hypothesis (Whisper ASR):   {len(hyp_norm)} chars (normalized)")
    print(f"  Length ratio:               {len(hyp_norm)/len(ref_norm):.3f}")
    print()

    # CER
    cer_result = compute_character_error_rate(ref_norm, hyp_norm)
    print("-" * 70)
    print("  Character Error Rate (CER)")
    print("-" * 70)
    print(f"  CER:              {cer_result['cer']:.4f}  ({cer_result['cer']*100:.2f}%)")
    print(f"  Accuracy:         {cer_result['accuracy']:.4f}  ({cer_result['accuracy']*100:.2f}%)")
    print()
    print(f"  Correct matches:  {cer_result['matches']}")
    print(f"  Substitutions:    {cer_result['substitutions']}")
    print(f"  Deletions:        {cer_result['deletions']}")
    print(f"  Insertions:       {cer_result['insertions']}")
    print(f"  Total errors:     {cer_result['total_errors']}")
    print()

    # N-gram accuracy
    bigram_acc = compute_ngram_accuracy(ref_norm, hyp_norm, n=2)
    trigram_acc = compute_ngram_accuracy(ref_norm, hyp_norm, n=3)
    print("-" * 70)
    print("  N-gram Overlap Accuracy")
    print("-" * 70)
    print(f"  Bigram (2-char):  {bigram_acc:.4f}  ({bigram_acc*100:.2f}%)")
    print(f"  Trigram (3-char): {trigram_acc:.4f}  ({trigram_acc*100:.2f}%)")
    print()

    # Error examples
    examples = collect_error_examples(ref_norm, hyp_norm, max_examples=25)

    print("-" * 70)
    print(f"  Substitution Examples (showing {len(examples['substitutions'])} of total)")
    print("-" * 70)
    for ex in examples["substitutions"][:25]:
        print(f"  pos {ex['position']:5d}: {ex['context']}")
    print()

    print("-" * 70)
    print(f"  Deletion Examples — in reference but missing from ASR ({len(examples['deletions'])})")
    print("-" * 70)
    for ex in examples["deletions"][:15]:
        print(f"  pos {ex['position']:5d}: {ex['context']}")
    print()

    print("-" * 70)
    print(f"  Insertion Examples — in ASR but not in reference ({len(examples['insertions'])})")
    print("-" * 70)
    for ex in examples["insertions"][:15]:
        print(f"  pos {ex['position']:5d}: {ex['context']}")
    print()

    # Summary
    print("=" * 70)
    print("  SUMMARY")
    print("=" * 70)
    print(f"  Character-level accuracy:  {cer_result['accuracy']*100:.1f}%")
    print(f"  Bigram-level accuracy:     {bigram_acc*100:.1f}%")
    print(f"  Trigram-level accuracy:     {trigram_acc*100:.1f}%")
    print()
    if cer_result['accuracy'] >= 0.95:
        print("  Rating: EXCELLENT — near-human transcription quality")
    elif cer_result['accuracy'] >= 0.90:
        print("  Rating: VERY GOOD — minor errors, highly usable")
    elif cer_result['accuracy'] >= 0.80:
        print("  Rating: GOOD — noticeable errors but content is understandable")
    elif cer_result['accuracy'] >= 0.70:
        print("  Rating: FAIR — significant errors, needs manual review")
    else:
        print("  Rating: POOR — too many errors for direct use")
    print("=" * 70)


if __name__ == "__main__":
    main()
