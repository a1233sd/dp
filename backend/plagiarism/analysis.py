from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Sequence

import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity


@dataclass
class SimilarityResult:
    report_id: str
    report_name: str
    similarity: float


def build_similarity_frame(target_text: str, candidates: Sequence[tuple[str, str]]) -> pd.DataFrame:
    """Return a DataFrame with similarity metrics for the provided candidates."""
    if not candidates:
        return pd.DataFrame(columns=['report_id', 'report_name', 'similarity'])

    corpus = [target_text] + [text for _, text in candidates]

    word_vectorizer = TfidfVectorizer(analyzer='word', ngram_range=(1, 3), min_df=1)
    char_vectorizer = TfidfVectorizer(analyzer='char_wb', ngram_range=(3, 5), min_df=1)

    word_matrix = word_vectorizer.fit_transform(corpus)
    char_matrix = char_vectorizer.fit_transform(corpus)

    word_similarities = cosine_similarity(word_matrix[0:1], word_matrix[1:]).flatten()
    char_similarities = cosine_similarity(char_matrix[0:1], char_matrix[1:]).flatten()

    # Weighted blend emphasises lexical similarity but keeps character level signal
    combined = (word_similarities * 0.65) + (char_similarities * 0.35)

    report_ids = [identifier for identifier, _ in candidates]
    report_names = [name for _, name in candidates]

    frame = pd.DataFrame({
        'report_id': report_ids,
        'report_name': report_names,
        'word_similarity': word_similarities,
        'char_similarity': char_similarities,
        'similarity': combined,
    })
    frame.sort_values(by='similarity', ascending=False, inplace=True)
    frame.reset_index(drop=True, inplace=True)
    return frame[['report_id', 'report_name', 'similarity']]


def iter_similarity_results(frame: pd.DataFrame) -> Iterable[SimilarityResult]:
    for row in frame.itertuples(index=False):
        yield SimilarityResult(
            report_id=str(row.report_id),
            report_name=str(row.report_name),
            similarity=float(row.similarity) * 100,
        )
