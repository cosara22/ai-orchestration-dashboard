"use client";

import React, { useState, useEffect, useCallback } from "react";
import { api, Milestone, NextAction, SemanticRecord } from "@/lib/api";

interface MilestoneRecorderProps {
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
  onMilestoneCreated?: () => void;
}

interface MilestoneFormData {
  title: string;
  description: string;
  target_date: string;
  priority: "high" | "medium" | "low";
  wbs_item_id?: string;
}

interface AchievementFormData {
  evidence_type: "commit" | "test_result" | "review" | "deployment" | "document" | "other";
  evidence_content: string;
  lessons_learned: string;
  next_actions: NextAction[];
}

export function MilestoneRecorder({ projectId, isOpen, onClose, onMilestoneCreated }: MilestoneRecorderProps) {
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [semanticRecords, setSemanticRecords] = useState<SemanticRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"milestones" | "records" | "create">("milestones");
  const [selectedMilestone, setSelectedMilestone] = useState<Milestone | null>(null);
  const [showAchieveModal, setShowAchieveModal] = useState(false);

  // Form states
  const [createForm, setCreateForm] = useState<MilestoneFormData>({
    title: "",
    description: "",
    target_date: "",
    priority: "medium",
  });

  const [achieveForm, setAchieveForm] = useState<AchievementFormData>({
    evidence_type: "commit",
    evidence_content: "",
    lessons_learned: "",
    next_actions: [],
  });

  const [newAction, setNewAction] = useState({ title: "", priority: "medium" as "high" | "medium" | "low" });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [milestonesRes, recordsRes] = await Promise.all([
        api.getMilestones({ project_id: projectId }),
        api.getSemanticRecords({ project_id: projectId }),
      ]);
      setMilestones(milestonesRes.milestones || []);
      setSemanticRecords(recordsRes.records || []);
    } catch (error) {
      console.error("Fetch error:", error);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (isOpen) {
      fetchData();
    }
  }, [isOpen, fetchData]);

  const handleCreateMilestone = async () => {
    if (!createForm.title.trim()) return;

    try {
      await api.createMilestone({
        project_id: projectId,
        ...createForm,
      });
      setCreateForm({
        title: "",
        description: "",
        target_date: "",
        priority: "medium",
      });
      setActiveTab("milestones");
      fetchData();
      onMilestoneCreated?.();
    } catch (error) {
      console.error("Create error:", error);
    }
  };

  const handleAchieveMilestone = async () => {
    if (!selectedMilestone) return;

    try {
      await api.achieveMilestone(selectedMilestone.milestone_id, {
        evidence: {
          commits: achieveForm.evidence_content ? [achieveForm.evidence_content] : [],
        },
        lessons_learned: achieveForm.lessons_learned,
        next_actions: achieveForm.next_actions,
      });

      setShowAchieveModal(false);
      setSelectedMilestone(null);
      setAchieveForm({
        evidence_type: "commit",
        evidence_content: "",
        lessons_learned: "",
        next_actions: [],
      });
      fetchData();
      onMilestoneCreated?.();
    } catch (error) {
      console.error("Achieve error:", error);
    }
  };

  const addNextAction = () => {
    if (!newAction.title.trim()) return;
    setAchieveForm((prev) => ({
      ...prev,
      next_actions: [
        ...prev.next_actions,
        {
          action: newAction.title,
          priority: newAction.priority,
        },
      ],
    }));
    setNewAction({ title: "", priority: "medium" });
  };

  const removeNextAction = (index: number) => {
    setAchieveForm((prev) => ({
      ...prev,
      next_actions: prev.next_actions.filter((_, i) => i !== index),
    }));
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "achieved":
        return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
      case "in_progress":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
      case "pending":
        return "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300";
      case "missed":
        return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300";
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high":
        return "text-red-600 dark:text-red-400";
      case "medium":
        return "text-yellow-600 dark:text-yellow-400";
      case "low":
        return "text-gray-600 dark:text-gray-400";
      default:
        return "text-gray-600 dark:text-gray-400";
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            マイルストーン・セマンティック記録
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setActiveTab("milestones")}
            className={`px-4 py-2 text-sm font-medium ${
              activeTab === "milestones"
                ? "text-blue-600 border-b-2 border-blue-600 dark:text-blue-400"
                : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            }`}
          >
            マイルストーン
          </button>
          <button
            onClick={() => setActiveTab("records")}
            className={`px-4 py-2 text-sm font-medium ${
              activeTab === "records"
                ? "text-blue-600 border-b-2 border-blue-600 dark:text-blue-400"
                : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            }`}
          >
            セマンティック記録
          </button>
          <button
            onClick={() => setActiveTab("create")}
            className={`px-4 py-2 text-sm font-medium ${
              activeTab === "create"
                ? "text-blue-600 border-b-2 border-blue-600 dark:text-blue-400"
                : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            }`}
          >
            + 新規作成
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto max-h-[calc(90vh-160px)]">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : (
            <>
              {/* Milestones Tab */}
              {activeTab === "milestones" && (
                <div className="space-y-4">
                  {milestones.length === 0 ? (
                    <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                      <svg className="w-12 h-12 mx-auto mb-4 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                      </svg>
                      <p>マイルストーンがありません</p>
                      <button
                        onClick={() => setActiveTab("create")}
                        className="mt-2 text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        最初のマイルストーンを作成
                      </button>
                    </div>
                  ) : (
                    milestones.map((milestone) => (
                      <div
                        key={milestone.milestone_id}
                        className="border border-gray-200 dark:border-gray-700 rounded-lg p-4"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <h3 className="text-base font-medium text-gray-900 dark:text-white">
                                {milestone.title}
                              </h3>
                              <span className={`text-xs px-2 py-0.5 rounded ${getStatusColor(milestone.status)}`}>
                                {milestone.status === "achieved" ? "達成" : milestone.status === "missed" ? "未達" : milestone.status === "deferred" ? "延期" : "予定"}
                              </span>
                              <span className={`text-xs text-gray-500`}>
                                {milestone.type}
                              </span>
                            </div>
                            {milestone.description && (
                              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                                {milestone.description}
                              </p>
                            )}
                            <div className="flex items-center gap-4 mt-2 text-xs text-gray-500 dark:text-gray-500">
                              {milestone.target_date && (
                                <span>目標: {new Date(milestone.target_date).toLocaleDateString("ja-JP")}</span>
                              )}
                              {milestone.achieved_date && (
                                <span>達成: {new Date(milestone.achieved_date).toLocaleDateString("ja-JP")}</span>
                              )}
                            </div>
                          </div>
                          {milestone.status !== "achieved" && (
                            <button
                              onClick={() => {
                                setSelectedMilestone(milestone);
                                setShowAchieveModal(true);
                              }}
                              className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700"
                            >
                              達成記録
                            </button>
                          )}
                        </div>

                        {/* Evidence & Next Actions */}
                        {milestone.evidence && (milestone.evidence.commits?.length || milestone.evidence.files_changed?.length) && (
                          <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">エビデンス:</div>
                            <div className="text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-700/50 p-2 rounded space-y-1">
                              {milestone.evidence.commits?.map((c, i) => (
                                <div key={i}>Commit: {c}</div>
                              ))}
                              {milestone.evidence.files_changed?.slice(0, 3).map((f, i) => (
                                <div key={i}>File: {f}</div>
                              ))}
                            </div>
                          </div>
                        )}

                        {milestone.next_actions && milestone.next_actions.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">ネクストアクション:</div>
                            <ul className="space-y-1">
                              {milestone.next_actions.map((action, idx) => (
                                <li key={idx} className="flex items-center gap-2 text-sm">
                                  <span className={`w-2 h-2 rounded-full ${getPriorityColor(action.priority)} bg-current`} />
                                  <span className="text-gray-700 dark:text-gray-300">{action.action}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Semantic Records Tab */}
              {activeTab === "records" && (
                <div className="space-y-4">
                  {semanticRecords.length === 0 ? (
                    <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                      <svg className="w-12 h-12 mx-auto mb-4 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                      </svg>
                      <p>セマンティック記録がありません</p>
                    </div>
                  ) : (
                    semanticRecords.map((record) => (
                      <div
                        key={record.record_id}
                        className="border border-gray-200 dark:border-gray-700 rounded-lg p-4"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <h3 className="text-base font-medium text-gray-900 dark:text-white">
                                {record.title}
                              </h3>
                              <span className="text-xs px-2 py-0.5 rounded bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300">
                                {record.record_type}
                              </span>
                            </div>
                            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 whitespace-pre-wrap">
                              {record.content.slice(0, 200)}
                              {record.content.length > 200 && "..."}
                            </p>
                            {record.tags && record.tags.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {record.tags.map((tag, i) => (
                                  <span
                                    key={i}
                                    className="text-xs px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded"
                                  >
                                    #{tag}
                                  </span>
                                ))}
                              </div>
                            )}
                            <div className="text-xs text-gray-500 dark:text-gray-500 mt-2">
                              {new Date(record.created_at).toLocaleString("ja-JP")}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Create Tab */}
              {activeTab === "create" && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      タイトル *
                    </label>
                    <input
                      type="text"
                      value={createForm.title}
                      onChange={(e) => setCreateForm((prev) => ({ ...prev, title: e.target.value }))}
                      placeholder="例: Phase 1 完了"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      説明
                    </label>
                    <textarea
                      value={createForm.description}
                      onChange={(e) => setCreateForm((prev) => ({ ...prev, description: e.target.value }))}
                      placeholder="マイルストーンの詳細説明..."
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        目標日
                      </label>
                      <input
                        type="date"
                        value={createForm.target_date}
                        onChange={(e) => setCreateForm((prev) => ({ ...prev, target_date: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        優先度
                      </label>
                      <select
                        value={createForm.priority}
                        onChange={(e) => setCreateForm((prev) => ({ ...prev, priority: e.target.value as "high" | "medium" | "low" }))}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      >
                        <option value="high">高</option>
                        <option value="medium">中</option>
                        <option value="low">低</option>
                      </select>
                    </div>
                  </div>

                  <div className="pt-4">
                    <button
                      onClick={handleCreateMilestone}
                      disabled={!createForm.title.trim()}
                      className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      マイルストーンを作成
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Achieve Modal */}
      {showAchieveModal && selectedMilestone && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-lg max-h-[80vh] overflow-hidden">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                達成を記録: {selectedMilestone.title}
              </h3>
            </div>

            <div className="p-4 overflow-y-auto max-h-[calc(80vh-140px)] space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  エビデンスタイプ
                </label>
                <select
                  value={achieveForm.evidence_type}
                  onChange={(e) => setAchieveForm((prev) => ({ ...prev, evidence_type: e.target.value as AchievementFormData["evidence_type"] }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="commit">コミット</option>
                  <option value="test_result">テスト結果</option>
                  <option value="review">レビュー</option>
                  <option value="deployment">デプロイ</option>
                  <option value="document">ドキュメント</option>
                  <option value="other">その他</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  エビデンス内容
                </label>
                <textarea
                  value={achieveForm.evidence_content}
                  onChange={(e) => setAchieveForm((prev) => ({ ...prev, evidence_content: e.target.value }))}
                  placeholder="コミットハッシュ、テスト結果、スクリーンショットのURL等..."
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  学んだこと・反省点
                </label>
                <textarea
                  value={achieveForm.lessons_learned}
                  onChange={(e) => setAchieveForm((prev) => ({ ...prev, lessons_learned: e.target.value }))}
                  placeholder="今回のマイルストーンで学んだこと..."
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  ネクストアクション
                </label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={newAction.title}
                    onChange={(e) => setNewAction((prev) => ({ ...prev, title: e.target.value }))}
                    placeholder="次のアクション..."
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                  />
                  <select
                    value={newAction.priority}
                    onChange={(e) => setNewAction((prev) => ({ ...prev, priority: e.target.value as "high" | "medium" | "low" }))}
                    className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                  >
                    <option value="high">高</option>
                    <option value="medium">中</option>
                    <option value="low">低</option>
                  </select>
                  <button
                    onClick={addNextAction}
                    disabled={!newAction.title.trim()}
                    className="px-3 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50"
                  >
                    追加
                  </button>
                </div>
                {achieveForm.next_actions.length > 0 && (
                  <ul className="space-y-1">
                    {achieveForm.next_actions.map((action, index) => (
                      <li key={index} className="flex items-center justify-between bg-gray-50 dark:bg-gray-700/50 px-3 py-2 rounded">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${getPriorityColor(action.priority)} bg-current`} />
                          <span className="text-sm text-gray-700 dark:text-gray-300">{action.action}</span>
                        </div>
                        <button
                          onClick={() => removeNextAction(index)}
                          className="text-red-500 hover:text-red-700 text-sm"
                        >
                          削除
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 p-4 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={() => {
                  setShowAchieveModal(false);
                  setSelectedMilestone(null);
                }}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >
                キャンセル
              </button>
              <button
                onClick={handleAchieveMilestone}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                達成を記録
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
