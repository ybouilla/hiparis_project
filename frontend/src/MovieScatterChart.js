import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  Label,
} from "recharts";
import CustomTooltip from "./CustomTooltip";

export default function MovieScatterChart({chartData, color, yLabel}){
    // color: "#38bdf8"

    const splitByLength = (text, maxLen = 50) => {
      const words = text.split(" ");
      const lines = [];

      let current = "";

      words.forEach(word => {
        if ((current + " " + word).trim().length > maxLen) {
          lines.push(current);
          current = word;
        } else {
          current = (current + " " + word).trim();
        }
      });

      if (current) lines.push(current);

      return lines;
};
    const labelLines = ({ viewBox, value }) => {
      if (!value) return null;
      const { x, y } = viewBox;

      return (
        <text 
              x={x}
              y={y}
          transform={`rotate(-90, ${x}, ${y})`}
          textAnchor="middle"
          position="outsideLeft">
            {
            splitByLength(value).map((line, i) => (
        <tspan key={i} x={x} dy={i === 0 ? 0 : 14} dx={i === 0 ? -180 : -100 }>
          {line}
        </tspan>
      ))}
        </text>
      );

};
    return (<div>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
    
                  <XAxis
                    dataKey="x"
                    type="number"
                    domain={['dataMin', 'dataMax']}
                    tickFormatter={(v) => new Date(v).getFullYear()}
                  >
                    <Label
                      value="Release Year"
                      position="bottom"
                      offset={20}
                    />
                </XAxis>
    
                <YAxis dataKey="y" type="number">
                  <Label
                    content={labelLines} value={yLabel} 

                  />
                </YAxis>
    
    
                  <Tooltip
                    // contentStyle={{
                    //   backgroundColor: "#0f172a",
                    //   border: "1px solid #334155",
                    // }}
                    content={<CustomTooltip />} 
                  />
    
                  <Scatter data={chartData} fill= {color}/>
                </div>)
}