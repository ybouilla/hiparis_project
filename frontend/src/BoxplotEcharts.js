import ReactECharts from "echarts-for-react";

export default function BoxplotEcharts({title, stats, isLog}) {
 const option = {
    title: {
      text: title
    },
    tooltip: {},
    xAxis: {
      type: "category",
      data: [title]
      
    },
    yAxis: {
      type: isLog?"log":"value"
    },
    series: [
      {
        type: "boxplot",
        data: [
          [stats.min, stats.q1, stats.q2, stats.q3, stats.max],

        ]
      }
    ]
  };

  return (
    <ReactECharts
      option={option}
      style={{ height: 500, width: "100%" }}
    />
  );
}